-- =========================================================
-- 0004: EQUIPO (varios usuarios por negocio) + TURNO DE CAJA POR USUARIO
-- =========================================================

-- Perfiles: email visible para el equipo y estado activo/inactivo -------------
alter table profiles add column if not exists email  text;
alter table profiles add column if not exists activo boolean not null default true;
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

-- Un usuario desactivado pierde el acceso a los datos del negocio
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from profiles where id = auth.uid() and activo
$$;

create or replace function rol_actual()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from profiles where id = auth.uid() and activo
$$;

-- Seguridad: nadie puede cambiarse su propio rol/tenant (solo el nombre) ----------
drop policy if exists "editar mi perfil" on profiles;
revoke update on profiles from authenticated, anon;
grant update (nombre) on profiles to authenticated;
create policy "editar mi perfil" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and tenant_id = current_tenant_id());

-- Invitaciones -------------------------------------------------------------------
create table if not exists invitaciones (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default current_tenant_id() references tenants(id) on delete cascade,
  codigo     text not null unique,
  rol        rol_usuario not null default 'cajero' check (rol in ('admin', 'cajero')),
  creado_por uuid default auth.uid() references profiles(id),
  expira_at  timestamptz not null default now() + interval '7 days',
  usado_por  uuid references profiles(id),
  usado_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists invitaciones_tenant_idx on invitaciones(tenant_id);
alter table invitaciones enable row level security;

drop policy if exists "admins ven invitaciones" on invitaciones;
drop policy if exists "admins borran invitaciones" on invitaciones;
create policy "admins ven invitaciones" on invitaciones for select
  using (tenant_id = current_tenant_id() and coalesce(rol_actual()::text, '') in ('owner', 'admin'));
create policy "admins borran invitaciones" on invitaciones for delete
  using (tenant_id = current_tenant_id() and coalesce(rol_actual()::text, '') in ('owner', 'admin'));

create or replace function crear_invitacion(p_rol rol_usuario default 'cajero')
returns text language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  if coalesce(rol_actual()::text, '') not in ('owner', 'admin') then raise exception 'No autorizado'; end if;
  if p_rol not in ('admin', 'cajero') then raise exception 'Rol inválido'; end if;
  if p_rol = 'admin' and rol_actual() <> 'owner' then
    raise exception 'Solo el dueño puede invitar administradores';
  end if;
  v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into invitaciones (tenant_id, codigo, rol, creado_por)
  values (current_tenant_id(), v_codigo, p_rol, auth.uid());
  return v_codigo;
end $$;

create or replace function actualizar_miembro(p_user uuid, p_rol rol_usuario, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(rol_actual()::text, '') <> 'owner' then raise exception 'Solo el dueño puede modificar el equipo'; end if;
  if p_user = auth.uid() then raise exception 'No podés modificarte a vos mismo'; end if;
  if p_rol = 'owner' then raise exception 'Rol inválido'; end if;
  update profiles set rol = p_rol, activo = p_activo
   where id = p_user and tenant_id = current_tenant_id();
  if not found then raise exception 'Miembro no encontrado'; end if;
end $$;

revoke all on function crear_invitacion(rol_usuario), actualizar_miembro(uuid, rol_usuario, boolean) from public, anon;
grant execute on function crear_invitacion(rol_usuario), actualizar_miembro(uuid, rol_usuario, boolean), rol_actual() to authenticated;

-- Alta de usuario: con código de invitación se une a un negocio; sin código crea uno nuevo
create or replace function handle_new_user()
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
    insert into tenants (nombre) values (coalesce(nullif(new.raw_user_meta_data->>'negocio', ''), 'Mi negocio'))
    returning id into nuevo_tenant;
    insert into profiles (id, tenant_id, nombre, rol, email)
    values (new.id, nuevo_tenant, new.raw_user_meta_data->>'nombre', 'owner', new.email);
  end if;
  return new;
end $$;

-- =========================================================
-- TURNO DE CAJA POR USUARIO: cada cajero abre y cierra el suyo
-- =========================================================
drop index if exists un_turno_abierto_por_tenant;
create unique index if not exists un_turno_abierto_por_usuario
  on turnos_caja(usuario_apertura) where estado = 'abierto';

create or replace function abrir_turno(p_monto_inicial numeric default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if exists (select 1 from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid()) then
    raise exception 'Ya tenés un turno abierto';
  end if;
  insert into turnos_caja (monto_inicial) values (coalesce(p_monto_inicial, 0)) returning id into v_id;
  return v_id;
end $$;

create or replace function registrar_venta(
  p_items jsonb,
  p_metodo metodo_pago,
  p_monto_recibido numeric default null,
  p_cliente_id uuid default null
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_total numeric(12,2); v_venta uuid; v_vuelto numeric(12,2);
begin
  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then raise exception 'No tenés un turno de caja abierto'; end if;
  if p_metodo = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'Una venta a cuenta requiere cliente';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  select sum(p.precio_venta * (i->>'cantidad')::numeric) into v_total
    from jsonb_array_elements(p_items) i
    join productos p on p.id = (i->>'producto_id')::uuid;
  if v_total is null then raise exception 'Productos inválidos'; end if;

  if p_metodo = 'efectivo' and p_monto_recibido is not null then
    if p_monto_recibido < v_total then raise exception 'El monto recibido no alcanza'; end if;
    v_vuelto := p_monto_recibido - v_total;
  end if;

  insert into ventas (turno_id, cliente_id, total, metodo_pago, monto_recibido, vuelto)
  values (v_turno, p_cliente_id, v_total, p_metodo, p_monto_recibido, v_vuelto)
  returning id into v_venta;

  insert into venta_items (venta_id, producto_id, nombre_producto, cantidad, precio_unitario, precio_costo, subtotal)
  select v_venta, p.id, p.nombre, (i->>'cantidad')::numeric, p.precio_venta, p.precio_costo,
         p.precio_venta * (i->>'cantidad')::numeric
    from jsonb_array_elements(p_items) i
    join productos p on p.id = (i->>'producto_id')::uuid;

  update productos pr set stock = pr.stock - s.cant, updated_at = now()
    from (select (i->>'producto_id')::uuid as id, sum((i->>'cantidad')::numeric) as cant
            from jsonb_array_elements(p_items) i group by 1) s
   where pr.id = s.id;

  if p_metodo = 'cuenta_corriente' then
    insert into movimientos_cuenta (cliente_id, tipo, monto, venta_id, notas)
    values (p_cliente_id, 'cargo', v_total, v_venta, 'Venta a cuenta');
  else
    insert into movimientos_caja (turno_id, tipo, metodo_pago, monto, descripcion, venta_id)
    values (v_turno, 'ingreso_venta', p_metodo, v_total, 'Venta', v_venta);
  end if;

  return v_venta;
end $$;

create or replace function registrar_egreso(p_monto numeric, p_concepto text)
returns uuid language plpgsql as $$
declare v_turno uuid; v_id uuid;
begin
  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then raise exception 'No tenés un turno de caja abierto'; end if;
  insert into movimientos_caja (turno_id, tipo, metodo_pago, monto, descripcion)
  values (v_turno, 'egreso_proveedor', 'efectivo', p_monto, p_concepto) returning id into v_id;
  return v_id;
end $$;

create or replace function cerrar_turno(p_efectivo_contado numeric)
returns jsonb language plpgsql as $$
declare v_t turnos_caja; v_esperado numeric(12,2);
begin
  select * into v_t from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_t.id is null then raise exception 'No tenés un turno abierto'; end if;

  select v_t.monto_inicial
         + coalesce(sum(case when tipo::text like 'ingreso%' then monto else -monto end), 0)
    into v_esperado
    from movimientos_caja where turno_id = v_t.id and metodo_pago = 'efectivo';

  update turnos_caja set estado = 'cerrado', cerrado_at = now(), usuario_cierre = auth.uid(),
         efectivo_esperado = v_esperado, efectivo_contado = p_efectivo_contado,
         diferencia = p_efectivo_contado - v_esperado
   where id = v_t.id;

  return jsonb_build_object('esperado', v_esperado, 'contado', p_efectivo_contado,
                            'diferencia', p_efectivo_contado - v_esperado);
end $$;

create or replace function registrar_mov_cuenta(
  p_cliente uuid, p_tipo tipo_mov_cuenta, p_monto numeric,
  p_notas text default null, p_metodo metodo_pago default 'efectivo'
) returns uuid language plpgsql as $$
declare v_id uuid; v_turno uuid;
begin
  insert into movimientos_cuenta (cliente_id, tipo, monto, notas, metodo_pago)
  values (p_cliente, p_tipo, p_monto, p_notas, case when p_tipo = 'pago' then p_metodo end)
  returning id into v_id;

  -- Un cobro de deuda entra a la caja del turno abierto de quien lo registra (si lo hay)
  if p_tipo = 'pago' then
    select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
    if v_turno is not null then
      insert into movimientos_caja (turno_id, tipo, metodo_pago, monto, descripcion)
      values (v_turno, 'ingreso_cobro_deuda', p_metodo, p_monto,
              'Cobro de cuenta corriente: ' || (select nombre from clientes where id = p_cliente));
    end if;
  end if;
  return v_id;
end $$;
