-- =========================================================
-- 0012: Pasarela de pagos completa, prueba gratis 7 días,
--       control SuperAdmin de suscripciones y métodos de cobro POS
-- =========================================================
-- Qué hace esta migración (idempotente):
--  1. Crea `update_modified_column()` (que faltaba en la 0005).
--  2. Extiende `suscripciones` con `tenant_id`, estado `'prueba'` y `'pausada'`,
--     y asegura 1 suscripción por negocio (`tenant_id`), migrando las existentes
--     con 7 días de prueba gratis si no tenían suscripción activa.
--  3. Agrega `tenants.metodos_pago_activos` (jsonb) para persistir los medios
--     de cobro habilitados en el POS y permite al owner/admin actualizar su tenant.
--  4. Actualiza `handle_new_user()` para que todo nuevo kiosco nazca automáticamente
--     con 7 días gratis (`estado = 'prueba'`, `fecha_fin = now() + 7 days`).
--  5. Agrega a `registrar_venta` y `abrir_turno` la verificación de suscripción
--     vigente (activa o en período de prueba no vencido).
--  6. Extiende el Panel SuperAdmin (`admin_resumen`, `admin_tenants`) y suma RPCs
--     (`admin_cambiar_estado_suscripcion`, `admin_agregar_dias_suscripcion`)
--     para activar, pausar o sumar/restar días a cualquier negocio.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1. Función helper para triggers updated_at (faltante en 0005)
-- ---------------------------------------------------------
create or replace function public.update_modified_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------
-- 2. Métodos de pago activos en cada negocio (POS) y actualización de tenant
-- ---------------------------------------------------------
alter table public.tenants
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metodos_pago_activos jsonb not null default
    '{"efectivo": true, "mercadopago": true, "tarjeta": true, "cuenta_corriente": true}'::jsonb;

drop policy if exists "editar mi tenant" on public.tenants;
create policy "editar mi tenant" on public.tenants
  for update
  using (id = current_tenant_id() and coalesce(rol_actual()::text, '') in ('owner', 'admin'))
  with check (id = current_tenant_id() and coalesce(rol_actual()::text, '') in ('owner', 'admin'));

-- ---------------------------------------------------------
-- 3. Evolución de la tabla `suscripciones` (por negocio + prueba de 7 días)
-- ---------------------------------------------------------
alter table public.suscripciones
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade;

-- Ampliar los checks de estado y proveedor para soportar 'prueba', 'pausada'
alter table public.suscripciones drop constraint if exists suscripciones_estado_check;
alter table public.suscripciones
  add constraint suscripciones_estado_check
  check (estado in ('prueba', 'activa', 'pausada', 'inactiva', 'pendiente', 'cancelada'));

alter table public.suscripciones drop constraint if exists suscripciones_proveedor_check;
alter table public.suscripciones
  add constraint suscripciones_proveedor_check
  check (proveedor in ('mercadopago', 'paypal', 'manual', 'prueba'));

-- Completar tenant_id en filas existentes a partir del perfil del usuario
update public.suscripciones s
   set tenant_id = p.tenant_id
  from public.profiles p
 where s.usuario_id = p.id
   and s.tenant_id is null;

-- Crear suscripción de prueba (7 días) para cualquier negocio existente que no tenga fila
insert into public.suscripciones (
  tenant_id, usuario_id, estado, proveedor, plan, precio, moneda, fecha_inicio, fecha_fin
)
select
  t.id,
  p.id,
  'prueba',
  'prueba',
  'Prueba Gratis (7 días)',
  20000.00,
  'ARS',
  now(),
  now() + interval '7 days'
from public.tenants t
join lateral (
  select id from public.profiles
   where tenant_id = t.id
   order by (case when rol = 'owner' then 0 else 1 end), created_at asc
   limit 1
) p on true
where not exists (
  select 1 from public.suscripciones s
   where s.tenant_id = t.id or s.usuario_id = p.id
);

-- Índice único por negocio para poder hacer upsert limpio desde webhooks y admin
create unique index if not exists un_tenant_suscripcion on public.suscripciones(tenant_id);

-- Rehacer el trigger de updated_at en suscripciones ahora que la función existe
drop trigger if exists update_suscripciones_modtime on public.suscripciones;
create trigger update_suscripciones_modtime
  before update on public.suscripciones
  for each row execute function public.update_modified_column();

-- Políticas RLS: cualquier miembro del negocio puede leer la suscripción de su negocio
drop policy if exists "Usuarios pueden ver su propia suscripcion" on public.suscripciones;
drop policy if exists "Miembros ven suscripcion de su negocio" on public.suscripciones;
create policy "Miembros ven suscripcion de su negocio" on public.suscripciones
  for select using (tenant_id = current_tenant_id() or usuario_id = auth.uid());

drop policy if exists "Miembros ven historial pagos de su negocio" on public.historial_pagos_suscripcion;
create policy "Miembros ven historial pagos de su negocio" on public.historial_pagos_suscripcion
  for select using (
    exists (
      select 1 from public.suscripciones s
       where s.id = historial_pagos_suscripcion.suscripcion_id
         and (s.tenant_id = current_tenant_id() or s.usuario_id = auth.uid())
    )
  );

-- Evitar duplicados de pagos en webhooks reintentados
create unique index if not exists un_pago_proveedor_suscripcion
  on public.historial_pagos_suscripcion(proveedor_pago_id)
  where proveedor_pago_id is not null;

-- ---------------------------------------------------------
-- 4. Onboarding: nuevos kioscos nacen con 7 días de prueba gratis
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  nuevo_tenant uuid;
  v_codigo text := upper(trim(coalesce(new.raw_user_meta_data->>'codigo_invitacion', '')));
  v_inv invitaciones;
begin
  if v_codigo <> '' then
    select * into v_inv from invitaciones
     where codigo = v_codigo and usado_por is null and expira_at > now()
     for update;
    if not found then raise exception 'Código de invitación inválido o vencido'; end if;

    insert into profiles (id, tenant_id, nombre, rol, email)
    values (new.id, v_inv.tenant_id, new.raw_user_meta_data->>'nombre', v_inv.rol, new.email);
    update invitaciones set usado_por = new.id, usado_at = now() where id = v_inv.id;
  else
    insert into tenants (nombre)
    values (coalesce(nullif(new.raw_user_meta_data->>'negocio', ''), 'Mi negocio'))
    returning id into nuevo_tenant;

    insert into profiles (id, tenant_id, nombre, rol, email)
    values (new.id, nuevo_tenant, new.raw_user_meta_data->>'nombre', 'owner', new.email);

    -- Alta automática de 7 días de prueba gratis para el nuevo kiosco
    insert into suscripciones (
      tenant_id, usuario_id, estado, proveedor, plan, precio, moneda, fecha_inicio, fecha_fin
    ) values (
      nuevo_tenant,
      new.id,
      'prueba',
      'prueba',
      'Prueba Gratis (7 días)',
      20000.00,
      'ARS',
      now(),
      now() + interval '7 days'
    );
  end if;
  return new;
end $$;

-- ---------------------------------------------------------
-- 5. Función de validación de acceso por suscripción
-- ---------------------------------------------------------
-- Devuelve true si el negocio actual tiene una suscripción 'activa' o 'prueba'
-- cuya fecha_fin sea futura (o nula), o si el usuario es SuperAdmin de plataforma.
create or replace function public.suscripcion_operativa(p_tenant uuid default current_tenant_id())
returns boolean language sql stable security definer set search_path = public as $$
  select
    is_platform_admin()
    or exists (
      select 1
        from public.suscripciones s
       where s.tenant_id = p_tenant
         and s.estado in ('activa', 'prueba')
         and (s.fecha_fin is null or s.fecha_fin >= now())
    )
$$;

grant execute on function public.suscripcion_operativa(uuid) to authenticated;

-- Proteger abrir_turno y registrar_venta cuando la suscripción está pausada o vencida
create or replace function public.abrir_turno(p_monto_inicial numeric default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if not public.suscripcion_operativa() then
    raise exception 'Tu suscripción o período de prueba venció. Reactivala desde Configuración.';
  end if;
  if exists (select 1 from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid()) then
    raise exception 'Ya tenés un turno abierto';
  end if;
  insert into turnos_caja (monto_inicial) values (coalesce(p_monto_inicial, 0)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.registrar_venta(
  p_items jsonb,
  p_metodo metodo_pago,
  p_monto_recibido numeric default null,
  p_cliente_id uuid default null
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_total numeric(12,2); v_venta uuid; v_vuelto numeric(12,2);
  v_items jsonb; v_invalidas integer;
begin
  if not public.suscripcion_operativa() then
    raise exception 'Tu suscripción o período de prueba está pausado o vencido. Reactivalo desde Configuración.';
  end if;

  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then raise exception 'No tenés un turno de caja abierto'; end if;
  if p_metodo = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'Una venta a cuenta requiere cliente';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) i
     where i->>'producto_id' is null
        or (i->>'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (i->>'cantidad') is null
        or (i->>'cantidad') !~ '^[0-9]+(\.[0-9]{1,3})?$'
        or (i->>'cantidad')::numeric <= 0
  ) then
    raise exception 'Hay items con una cantidad inválida en la venta';
  end if;

  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
         count(*) filter (where cantidad is null)
    into v_items, v_invalidas
    from (
      select (i->>'producto_id')::uuid as producto_id,
             public.cantidad_valida_venta((i->>'producto_id')::uuid,
                                          sum((i->>'cantidad')::numeric)) as cantidad
        from jsonb_array_elements(p_items) i
       group by 1
    ) s;
  if v_invalidas > 0 then
    raise exception 'Hay items con una cantidad inválida en la venta (los productos por unidad se venden en enteros)';
  end if;

  select sum(round(p.precio_venta * (i->>'cantidad')::numeric, 2)) into v_total
    from jsonb_array_elements(v_items) i
    join productos p on p.id = (i->>'producto_id')::uuid;
  if v_total is null then raise exception 'Productos inválidos'; end if;
  v_total := round(v_total, 2);

  if p_metodo = 'efectivo' and p_monto_recibido is not null then
    if p_monto_recibido < v_total then raise exception 'El monto recibido no alcanza'; end if;
    v_vuelto := p_monto_recibido - v_total;
  end if;

  insert into ventas (turno_id, cliente_id, total, metodo_pago, monto_recibido, vuelto)
  values (v_turno, p_cliente_id, v_total, p_metodo, p_monto_recibido, v_vuelto)
  returning id into v_venta;

  insert into venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_costo, subtotal)
  select v_venta, p.id, p.nombre, (i->>'cantidad')::numeric, p.precio_venta, p.precio_costo,
         round(p.precio_venta * (i->>'cantidad')::numeric, 2)
    from jsonb_array_elements(v_items) i
    join productos p on p.id = (i->>'producto_id')::uuid;

  perform set_config('kiosco.venta', '1', true);
  update productos pr
     set stock = round(coalesce(pr.stock, 0) - s.cant, 3), updated_at = now()
    from (select (i->>'producto_id')::uuid as id, sum((i->>'cantidad')::numeric) as cant
            from jsonb_array_elements(v_items) i group by 1) s
   where pr.id = s.id;
  perform set_config('kiosco.venta', '', true);

  if p_metodo = 'cuenta_corriente' then
    insert into movimientos_cuenta (cliente_id, tipo, monto, venta_id, notas)
    values (p_cliente_id, 'cargo', v_total, v_venta, 'Venta a cuenta');
  else
    insert into movimientos_caja
      (turno_id, tipo, metodo_pago, monto, descripcion, venta_id, items, referencia)
    select v_turno, 'ingreso_venta', p_metodo, v_total, 'Venta', v_venta,
           jsonb_agg(jsonb_build_object(
             'producto_id', vi.producto_id,
             'nombre', vi.nombre_producto,
             'cantidad', -vi.cantidad,
             'motivo', 'venta') order by vi.nombre_producto),
           'venta:' || v_venta::text
      from venta_items vi
     where vi.venta_id = v_venta;
  end if;

  return v_venta;
end $$;

-- ---------------------------------------------------------
-- 6. Panel SuperAdmin: estado de suscripciones y control de días/pausa
-- ---------------------------------------------------------
drop function if exists public.admin_tenants();

create or replace function public.admin_tenants()
returns table (
  id uuid,
  nombre text,
  created_at timestamptz,
  owner_email text,
  usuarios bigint,
  productos bigint,
  ventas bigint,
  monto numeric,
  ultima_venta timestamptz,
  suscripcion_estado text,
  suscripcion_plan text,
  suscripcion_proveedor text,
  suscripcion_fecha_fin timestamptz,
  dias_restantes int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  return query
    select
      t.id,
      t.nombre,
      t.created_at,
      (select p.email from profiles p where p.tenant_id = t.id order by (case when p.rol = 'owner' then 0 else 1 end), p.created_at asc limit 1) as owner_email,
      (select count(*) from profiles p where p.tenant_id = t.id),
      (select count(*) from productos pr where pr.tenant_id = t.id),
      count(v.id) filter (where v.estado = 'completada'),
      coalesce(sum(v.total) filter (where v.estado = 'completada'), 0),
      max(v.created_at),
      coalesce(s.estado, 'inactiva') as suscripcion_estado,
      coalesce(s.plan, 'Sin plan') as suscripcion_plan,
      coalesce(s.proveedor, 'manual') as suscripcion_proveedor,
      s.fecha_fin as suscripcion_fecha_fin,
      case
        when s.fecha_fin is null then 0
        else ceil(extract(epoch from (s.fecha_fin - now())) / 86400.0)::int
      end as dias_restantes
    from tenants t
    left join ventas v on v.tenant_id = t.id
    left join suscripciones s on s.tenant_id = t.id
    group by t.id, s.estado, s.plan, s.proveedor, s.fecha_fin
    order by max(v.created_at) desc nulls last, t.created_at desc;
end $$;

-- Sumar o restar días de acceso (prueba o suscripción activa) a un negocio
create or replace function public.admin_agregar_dias_suscripcion(
  p_tenant_id uuid,
  p_dias int
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_sub suscripciones;
  v_base timestamptz;
  v_nueva_fin timestamptz;
  v_nuevo_estado text;
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  if p_dias is null or p_dias = 0 then raise exception 'Indicá una cantidad de días distinta de cero'; end if;

  select id into v_owner
    from profiles
   where tenant_id = p_tenant_id
   order by (case when rol = 'owner' then 0 else 1 end), created_at asc
   limit 1;

  if v_owner is null then raise exception 'El negocio no tiene usuarios asociados'; end if;

  select * into v_sub from suscripciones where tenant_id = p_tenant_id for update;

  if v_sub.id is null then
    v_nueva_fin := now() + make_interval(days => greatest(1, p_dias));
    insert into suscripciones (
      tenant_id, usuario_id, estado, proveedor, plan, precio, moneda, fecha_inicio, fecha_fin
    ) values (
      p_tenant_id, v_owner, 'prueba', 'manual', 'Prueba Gratis', 20000.00, 'ARS', now(), v_nueva_fin
    ) returning * into v_sub;
  else
    -- Si estaba vencida y se suman días positivos, arrancamos a contar desde hoy
    if p_dias > 0 then
      v_base := greatest(coalesce(v_sub.fecha_fin, now()), now());
    else
      v_base := coalesce(v_sub.fecha_fin, now());
    end if;
    v_nueva_fin := v_base + make_interval(days => p_dias);

    -- Si se agregan días y estaba inactiva/vencida/cancelada, pasa a 'prueba' (o mantiene 'activa')
    v_nuevo_estado := case
      when v_nueva_fin > now() and v_sub.estado in ('inactiva', 'cancelada', 'pendiente') then 'prueba'
      else v_sub.estado
    end;

    update suscripciones
       set fecha_fin = v_nueva_fin,
           estado = v_nuevo_estado,
           updated_at = now()
     where id = v_sub.id
     returning * into v_sub;
  end if;

  return jsonb_build_object(
    'estado', v_sub.estado,
    'fecha_fin', v_sub.fecha_fin
  );
end $$;

-- Cambiar el estado de la suscripción de un negocio (ej: 'activa', 'pausada', 'prueba', 'cancelada')
create or replace function public.admin_cambiar_estado_suscripcion(
  p_tenant_id uuid,
  p_estado text,
  p_plan text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_sub suscripciones;
  v_fin timestamptz;
begin
  if not is_platform_admin() then raise exception 'No autorizado'; end if;
  if p_estado not in ('prueba', 'activa', 'pausada', 'inactiva', 'cancelada') then
    raise exception 'Estado de suscripción inválido';
  end if;

  select id into v_owner
    from profiles
   where tenant_id = p_tenant_id
   order by (case when rol = 'owner' then 0 else 1 end), created_at asc
   limit 1;

  if v_owner is null then raise exception 'El negocio no tiene usuarios asociados'; end if;

  select * into v_sub from suscripciones where tenant_id = p_tenant_id for update;

  if v_sub.id is null then
    v_fin := case
      when p_estado = 'activa' then now() + interval '30 days'
      when p_estado = 'prueba' then now() + interval '7 days'
      else now()
    end;
    insert into suscripciones (
      tenant_id, usuario_id, estado, proveedor, plan, precio, moneda, fecha_inicio, fecha_fin
    ) values (
      p_tenant_id,
      v_owner,
      p_estado,
      'manual',
      coalesce(p_plan, case when p_estado = 'prueba' then 'Prueba Gratis (7 días)' else 'Plan Pioneros Mensual' end),
      20000.00,
      'ARS',
      now(),
      v_fin
    ) returning * into v_sub;
  else
    -- Si se activa o pasa a prueba y la fecha ya estaba vencida, garantizamos días hacia adelante
    v_fin := v_sub.fecha_fin;
    if p_estado = 'activa' and (v_fin is null or v_fin < now()) then
      v_fin := now() + interval '30 days';
    elsif p_estado = 'prueba' and (v_fin is null or v_fin < now()) then
      v_fin := now() + interval '7 days';
    end if;

    update suscripciones
       set estado = p_estado,
           plan = coalesce(p_plan, plan),
           fecha_fin = v_fin,
           updated_at = now()
     where id = v_sub.id
     returning * into v_sub;
  end if;

  return jsonb_build_object(
    'estado', v_sub.estado,
    'plan', v_sub.plan,
    'fecha_fin', v_sub.fecha_fin
  );
end $$;

revoke all on function
  public.admin_tenants(),
  public.admin_agregar_dias_suscripcion(uuid, int),
  public.admin_cambiar_estado_suscripcion(uuid, text, text)
from public, anon;

grant execute on function
  public.admin_tenants(),
  public.admin_agregar_dias_suscripcion(uuid, int),
  public.admin_cambiar_estado_suscripcion(uuid, text, text)
to authenticated;

commit;

