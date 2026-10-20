-- =========================================================
-- 0008: Bitácora de movimientos de caja
-- =========================================================
-- Contexto del cambio:
--  * El dueño (y el administrador) pueden auditar toda la operación de caja:
--    qué pasó, qué día, quién lo registró, qué elementos se movieron y, en
--    los egresos, si hubo ingreso de stock asociado.
--  * Hasta acá el movimiento sólo guardaba tipo/monto/descripción, y cada
--    cambio de stock (alta, ajuste manual, venta) no dejaba rastro.
--
-- Idempotente: se puede volver a correr sin romper nada.

-- ---------------------------------------------------------
-- 1. Columnas nuevas en movimientos_caja
-- ---------------------------------------------------------
alter table movimientos_caja
  -- Egreso que vino con mercadería (pago a proveedor con reposición, etc.)
  add column if not exists stock_involucrado boolean not null default false,
  -- Qué se movió: [{producto_id, nombre, cantidad, motivo}]
  add column if not exists items jsonb,
  -- Medio usado sin las restricciones del enum de ventas (p.ej. 'transferencia')
  add column if not exists forma_pago text,
  -- Aclaración libre: proveedor, comprobante, motivo del ajuste…
  add column if not exists detalle text,
  -- Vínculo con otra operación (ver comentarios más abajo)
  add column if not exists referencia text;

comment on column movimientos_caja.stock_involucrado is
  'true = el egreso u operación estuvo vinculado con un ingreso de stock.';
comment on column movimientos_caja.items is
  'Elementos movidos: [{producto_id, nombre, cantidad, motivo}]. Negativo = salida.';
comment on column movimientos_caja.referencia is
  'Origen: producto:<id>, ajuste:<uuid>, compra:<texto>, venta:<id>, venta-anulada:<id>.';

-- Un mismo comprobante/operación no puede impactar dos veces en la caja.
create unique index if not exists un_movimiento_por_referencia
  on movimientos_caja(tenant_id, referencia)
  where referencia is not null;

create index if not exists ix_movimientos_caja_tenant_fecha
  on movimientos_caja(tenant_id, created_at desc);

-- Tipos nuevos: nota de stock (monto 1, no afecta el efectivo) y anulación de venta.
do $$
begin
  alter type tipo_mov_caja add value if not exists 'nota_stock';
  alter type tipo_mov_caja add value if not exists 'egreso_anulacion';
end $$;

-- Por si la columna no llegó en equipos con migraciones aplicadas a mano.
alter table profiles add column if not exists activo boolean not null default true;


-- ---------------------------------------------------------
-- 2. Helpers de lectura de la bitácora
-- ---------------------------------------------------------
create or replace function public.rol_actual()
returns rol_usuario language sql stable security definer set search_path = public as $$
  select rol from profiles where id = auth.uid()
$$;

-- Dueño y administrador ven la bitácora de todo el equipo.
create or replace function public.puede_ver_bitacora()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual()::text, '') in ('owner', 'admin')
$$;

-- Entradas de mercadería del turno para cruzarlas con los egresos: si un
-- egreso de efectivo tiene un ingreso de stock al lado (pago al proveedor con
-- reposición), la bitácora lo marca como vinculado.
create or replace function ingresos_stock_del_turno(p_turno uuid)
returns table (
  movimiento_id uuid,
  created_at    timestamptz,
  usuario_id    uuid,
  usuario       text,
  descripcion   text,
  referencia    text,
  items         jsonb
) language plpgsql stable security definer set search_path = public as $$
begin
  if not puede_ver_bitacora() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from turnos_caja where id = p_turno and tenant_id = current_tenant_id()) then
    raise exception 'Turno no encontrado';
  end if;

  return query
    select m.id, m.created_at, m.usuario_id,
           coalesce(nullif(pf.nombre, ''), 'Usuario'),
           m.descripcion, m.referencia, m.items
      from movimientos_caja m
      left join profiles pf on pf.id = m.usuario_id
     where m.turno_id = p_turno
       and m.items is not null
       and coalesce(m.referencia, '') not like 'venta:%'
       and exists (
         select 1 from jsonb_array_elements(m.items) e
          where coalesce((e->>'cantidad')::numeric, 0) > 0
       )
     order by m.created_at;
end $$;

-- Ítems de una venta (para abrir el detalle desde la bitácora).
create or replace function detalle_venta_para_caja(p_venta uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_items jsonb;
begin
  if not puede_ver_bitacora() then raise exception 'No autorizado'; end if;
  select jsonb_agg(jsonb_build_object(
           'producto_id', vi.producto_id,
           'nombre', vi.nombre_producto,
           'cantidad', -vi.cantidad,
           'motivo', 'venta') order by vi.nombre_producto)
    into v_items
    from venta_items vi
    join ventas v on v.id = vi.venta_id
   where vi.venta_id = p_venta and v.tenant_id = current_tenant_id();
  return v_items;
end $$;

-- ---------------------------------------------------------
-- 3. Los movimientos de caja son de sólo alta (no se borran)
-- ---------------------------------------------------------
create or replace function bitacora_caja_al_borrar()
returns trigger language plpgsql as $$
begin
  raise exception 'Los movimientos de caja no se pueden eliminar: la bitácora es permanente';
end $$;

drop trigger if exists trg_bitacora_caja_al_borrar on movimientos_caja;
create trigger trg_bitacora_caja_al_borrar
  before delete on movimientos_caja
  for each row execute function bitacora_caja_al_borrar();

-- ---------------------------------------------------------
-- 4. registrar_egreso: contexto opcional del egreso
-- ---------------------------------------------------------
-- Se reemplaza la versión de 2 argumentos (no queda sobrecarga, así PostgREST
-- no tiene ambigüedad al llamarla desde la app).
drop function if exists registrar_egreso(numeric, text);

create or replace function registrar_egreso(
  p_monto numeric,
  p_concepto text,
  p_detalle text default null,
  p_stock_involucrado boolean default false,
  p_items jsonb default null,
  p_referencia text default null,
  p_forma_pago text default 'efectivo'
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_id uuid; v_desc text; v_detalle text; v_ref text;
begin
  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then raise exception 'No tenés un turno de caja abierto'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto del egreso debe ser mayor a cero'; end if;

  v_desc := nullif(btrim(coalesce(p_concepto, '')), '');
  if v_desc is null then raise exception 'Indicá el concepto del egreso'; end if;

  v_detalle := nullif(btrim(coalesce(p_detalle, '')), '');
  -- El detalle se suma al concepto para que la bitácora lo muestre sin joins.
  if v_detalle is not null then v_desc := v_desc || ' — ' || v_detalle; end if;

  v_ref := nullif(btrim(coalesce(p_referencia, '')), '');

  insert into movimientos_caja
    (turno_id, tipo, metodo_pago, monto, descripcion,
     stock_involucrado, items, forma_pago, detalle, referencia)
  values
    (v_turno, 'egreso_proveedor', 'efectivo', p_monto, left(v_desc, 500),
     coalesce(p_stock_involucrado, false), p_items,
     nullif(btrim(coalesce(p_forma_pago, '')), ''), v_detalle, v_ref)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un egreso con esa referencia (¿comprobante repetido?)';
end $$;

-- ---------------------------------------------------------
-- 5. Ajustes de stock: toda variación queda en la bitácora
-- ---------------------------------------------------------
-- Acumula una línea de stock en un jsonb de ítems. Si la suma de un producto
-- queda en cero, la línea desaparece.
create or replace function bitacora_merge_items(p_items jsonb, p_linea jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(x order by orden), '[]'::jsonb) from (
    select jsonb_build_object(
             'producto_id', producto_id,
             'nombre',      max(nombre),
             'cantidad',    sum(cantidad),
             'motivo',      motivo) as x,
           max(nombre) as orden
      from (
        select coalesce(e->>'producto_id', '')                 as producto_id,
               coalesce(nullif(e->>'nombre', ''), 'Producto')  as nombre,
               coalesce((e->>'cantidad')::numeric, 0)          as cantidad,
               coalesce(nullif(e->>'motivo', ''), 'ajuste_manual') as motivo
          from jsonb_array_elements(coalesce(p_items, '[]'::jsonb) || coalesce(p_linea, '[]'::jsonb)) e
      ) l
     group by producto_id, motivo
     having sum(cantidad) <> 0
  ) g;
$$;


-- El stock de un producto cambia SÓLO por acá: ajusta y deja la línea en la
-- bitácora del turno abierto (si no hay turno, igual ajusta el stock).
--   p_cantidad > 0 = ingreso de stock (reposición / corrección al alza)
--   p_cantidad < 0 = egreso de stock  (merma, rotura, pérdida)
--   p_afecta_caja  = la operatoria también movió dinero de la caja
--   p_movimiento   = id del movimiento de caja al que se le suma la línea
create or replace function ajustar_stock(
  p_producto uuid,
  p_cantidad numeric,
  p_motivo text default 'ajuste_manual',
  p_detalle text default null,
  p_afecta_caja boolean default false,
  p_movimiento uuid default null,
  p_referencia text default null
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_prod productos; v_tenant uuid; v_id uuid;
  v_ref text; v_det text; v_linea jsonb;
begin
  select * into v_prod from productos where id = p_producto and tenant_id = current_tenant_id();
  if v_prod.id is null then raise exception 'Producto no encontrado'; end if;
  if coalesce(p_cantidad, 0) = 0 then raise exception 'La cantidad del ajuste no puede ser cero'; end if;

  v_tenant := v_prod.tenant_id;
  v_det := nullif(btrim(coalesce(p_detalle, '')), '');
  v_ref := coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), 'ajuste:' || gen_random_uuid()::text);
  v_linea := jsonb_build_array(jsonb_build_object(
               'producto_id', p_producto,
               'nombre', v_prod.nombre,
               'cantidad', p_cantidad,
               'motivo', coalesce(nullif(p_motivo, ''), 'ajuste_manual')));

  update productos set stock = coalesce(stock, 0) + p_cantidad, updated_at = now()
   where id = p_producto;

  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();

  -- Sin turno abierto no hay bitácora de caja que completar (el stock sí se ajustó).
  if v_turno is null then return null; end if;

  if p_movimiento is not null then
    update movimientos_caja
       set items = bitacora_merge_items(items, v_linea),
           stock_involucrado = true
     where id = p_movimiento and tenant_id = v_tenant;
    if found then return p_movimiento; end if;
  end if;

  insert into movimientos_caja
    (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion,
     items, stock_involucrado, detalle, referencia)
  values
    (v_tenant, v_turno, 'nota_stock', 'efectivo', 1,
     left((case when p_cantidad > 0 then 'Ingreso de stock: ' else 'Egreso de stock: ' end)
          || v_prod.nombre || ' ('
          || case when p_cantidad > 0 then '+' else '' end || p_cantidad::text || ')', 500),
     v_linea,
     coalesce(p_afecta_caja, false) or p_cantidad > 0,
     v_det, v_ref)
  returning id into v_id;

  return v_id;
end $$;

-- Alta de producto con stock: queda registrado el stock inicial.
create or replace function bitacora_stock_inicial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.stock, 0) <> 0 then
    perform ajustar_stock(
      new.id, new.stock, 'carga_inicial', 'Alta de producto', true, null,
      'producto:' || new.id::text || ':alta');
  end if;
  return new;
end $$;

drop trigger if exists trg_bitacora_stock_inicial on productos;
create trigger trg_bitacora_stock_inicial
  after insert on productos
  for each row execute function bitacora_stock_inicial();


-- ---------------------------------------------------------
-- 6. Variaciones de stock hechas desde la app (editar producto, POS)
-- ---------------------------------------------------------
-- Se registran con el motivo que manda la app vía `set_config`:
--   kiosco.motivo_stock, kiosco.detalle_stock, kiosco.afecta_caja,
--   kiosco.referencia_stock y kiosco.venta (operación de venta en curso).
-- La app manda el motivo del cambio de stock antes de cada update. Se pasa
-- por configuración de sesión (no por argumentos) para no tener que cambiar
-- la firma de `update` que usa PostgREST, y para que el trigger lo lea en la
-- misma transacción. Cualquier usuario del negocio puede fijar su propio motivo.
create or replace function public.set_bitacora_contexto(
  p_motivo text default null,
  p_detalle text default null,
  p_afecta_caja boolean default null,
  p_referencia text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  perform set_config('kiosco.motivo_stock', coalesce(p_motivo, ''), true);
  perform set_config('kiosco.detalle_stock', coalesce(p_detalle, ''), true);
  perform set_config('kiosco.afecta_caja', case when p_afecta_caja is null then '' else p_afecta_caja::text end, true);
  perform set_config('kiosco.referencia_stock', coalesce(p_referencia, ''), true);
end $$;

create or replace function bitacora_stock_desde_producto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_delta numeric; v_motivo text; v_caja boolean;
begin
  v_delta := coalesce(new.stock, 0) - coalesce(old.stock, 0);
  if v_delta = 0 then return new; end if;
  -- Las ventas ya dejan su línea (ver bitacora_stock_por_venta).
  if nullif(current_setting('kiosco.venta', true), '') = '1' then return new; end if;

  v_motivo := nullif(current_setting('kiosco.motivo_stock', true), '');
  if v_motivo is null then
    v_motivo := case when v_delta > 0 then 'ingreso_stock' else 'ajuste_manual' end;
  end if;
  v_caja := coalesce(nullif(current_setting('kiosco.afecta_caja', true), '')::boolean, v_delta > 0);

  begin
    perform ajustar_stock(
      new.id, v_delta, v_motivo,
      nullif(current_setting('kiosco.detalle_stock', true), ''),
      v_caja, null, nullif(current_setting('kiosco.referencia_stock', true), ''));
  exception when others then
    -- Un problema al escribir la bitácora no debe romper el cambio de stock
    -- (por ejemplo, una clave duplicada de referencia).
    null;
  end;
  return new;
end $$;

drop trigger if exists trg_bitacora_stock_producto on productos;
create trigger trg_bitacora_stock_producto
  after update of stock on productos
  for each row execute function bitacora_stock_desde_producto();

-- Las ventas descuentan stock con un update masivo que no pasa por
-- ajustar_stock: este trigger escribe la salida SIN volver a tocar el stock.
create or replace function bitacora_stock_por_venta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cant numeric; v_turno uuid; v_venta uuid; v_linea jsonb; v_ref text; v_mov uuid;
begin
  if coalesce(new.stock, 0) >= coalesce(old.stock, 0) then return new; end if;
  if nullif(current_setting('kiosco.venta', true), '') = '1' then return new; end if;

  v_cant := coalesce(old.stock, 0) - coalesce(new.stock, 0);

  select v.id, v.turno_id into v_venta, v_turno
    from ventas v
   where v.tenant_id = new.tenant_id
     and v.created_at > now() - interval '5 minutes'
     and exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.producto_id = new.id)
   order by v.created_at desc limit 1;

  v_ref := case when v_venta is null then 'ajuste:' || gen_random_uuid()::text
                else 'venta:' || v_venta::text end;
  v_linea := jsonb_build_array(jsonb_build_object(
               'producto_id', new.id,
               'nombre', new.nombre,
               'cantidad', -v_cant,
               'motivo', case when v_venta is null then 'seguimiento' else 'venta' end));

  if v_turno is null then
    select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  end if;
  if v_turno is null then return new; end if;

  if v_venta is not null then
    update movimientos_caja
       set items = bitacora_merge_items(items, v_linea)
     where tenant_id = new.tenant_id and referencia = v_ref
     returning id into v_mov;
    if v_mov is not null then return new; end if;
  end if;

  insert into movimientos_caja
    (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion, items, referencia)
  values
    (new.tenant_id, v_turno, 'nota_stock', 'efectivo', 1,
     left((case when v_venta is null then 'Seguimiento de stock: ' else 'Salida por venta: ' end)
          || new.nombre || ' (-' || v_cant::text || ')', 500),
     v_linea, v_ref);
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_bitacora_stock_venta on productos;
create trigger trg_bitacora_stock_venta
  after update of stock on productos
  for each row execute function bitacora_stock_por_venta();


-- ---------------------------------------------------------
-- 7. Ventas: el movimiento deja la salida de stock y se puede anular
-- ---------------------------------------------------------
create or replace function bitacora_venta_al_registrar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_items jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'producto_id', vi.producto_id,
           'nombre', vi.nombre_producto,
           'cantidad', -vi.cantidad,
           'motivo', 'venta') order by vi.nombre_producto)
    into v_items
    from venta_items vi where vi.venta_id = new.id;

  update movimientos_caja
     set items = bitacora_merge_items(items, v_items),
         referencia = coalesce(referencia, 'venta:' || new.id::text)
   where venta_id = new.id;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_bitacora_venta on ventas;
create trigger trg_bitacora_venta
  after insert on ventas
  for each row execute function bitacora_venta_al_registrar();

-- Anular una venta: devuelve stock, reintegra el dinero a la caja del turno
-- donde se cobró y deja los dos movimientos enlazados por referencia.
create or replace function anular_venta(p_venta uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_venta ventas; v_turno uuid; v_items jsonb; v_motivo text;
begin
  select * into v_venta from ventas
   where id = p_venta and tenant_id = current_tenant_id() and estado = 'completada';
  if v_venta.id is null then raise exception 'Venta no encontrada o ya anulada'; end if;
  if v_venta.usuario_id <> auth.uid() and not puede_ver_bitacora() then
    raise exception 'No autorizado';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  select jsonb_agg(jsonb_build_object(
           'producto_id', vi.producto_id,
           'nombre', vi.nombre_producto,
           'cantidad', vi.cantidad,
           'motivo', 'anulacion') order by vi.nombre_producto)
    into v_items
    from venta_items vi where vi.venta_id = v_venta.id;

  -- Devolver el stock (marcado como operación de venta para que el trigger
  -- de stock no lo tome como otra salida).
  perform set_config('kiosco.venta', '1', true);
  update productos p
     set stock = coalesce(p.stock, 0) + s.cant, updated_at = now()
    from (select producto_id, sum(cantidad) as cant
            from venta_items where venta_id = v_venta.id group by 1) s
   where p.id = s.producto_id
     and p.tenant_id = v_venta.tenant_id;
  perform set_config('kiosco.venta', '', true);

  update ventas set estado = 'anulada' where id = v_venta.id;

  if v_venta.metodo_pago <> 'cuenta_corriente' then
    insert into movimientos_caja
      (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion, items, referencia)
    values
      (v_venta.tenant_id, v_venta.turno_id, 'egreso_anulacion', v_venta.metodo_pago, v_venta.total,
       left('Anulación de venta' || coalesce(' — ' || v_motivo, ''), 500),
       coalesce(v_items, '[]'::jsonb), 'venta-anulada:' || v_venta.id::text);
  else
    insert into movimientos_cuenta (cliente_id, tipo, monto, venta_id, notas)
    values (v_venta.cliente_id, 'pago', v_venta.total, v_venta.id, 'Anulación de venta');
  end if;

  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then v_turno := v_venta.turno_id; end if;

  insert into movimientos_caja
    (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion, items, referencia)
  values
    (v_venta.tenant_id, v_turno, 'nota_stock', 'efectivo', 1,
     left('Devolución de stock por venta anulada'
          || coalesce(' (' || v_motivo || ')', ''), 500),
     coalesce(v_items, '[]'::jsonb), 'venta-reversion:' || v_venta.id::text);

  return jsonb_build_object('venta', v_venta.id, 'items', coalesce(v_items, '[]'::jsonb));
end $$;

revoke all on function anular_venta(uuid, text) from public, anon;
grant execute on function anular_venta(uuid, text) to authenticated;


-- ---------------------------------------------------------
-- 8. Egreso que nace vinculado al ingreso de stock
-- ---------------------------------------------------------
-- Ej.: pago al proveedor con reposición de mercadería. El egreso queda
-- marcado y, si después se cargan los productos, la bitácora muestra el
-- detalle sin duplicar el dinero.
create or replace function registrar_egreso_stock(
  p_monto numeric,
  p_concepto text,
  p_detalle text default null,
  p_motivo text default 'compra_proveedor',
  p_referencia text default null,
  p_forma_pago text default 'efectivo'
) returns uuid language plpgsql as $$
declare v_id uuid; v_det text;
begin
  v_det := nullif(btrim(coalesce(p_detalle, '')), '');

  v_id := registrar_egreso(
    p_monto, p_concepto, v_det, true, null, p_referencia, p_forma_pago);

  -- Deja dicho qué tipo de ingreso de mercadería respalda el egreso.
  update movimientos_caja
     set detalle = trim(both E'\n' from
           concat_ws(E'\n', nullif(detalle, ''), 'Ingreso de stock: ' || coalesce(nullif(p_motivo, ''), 'compra_proveedor')))
   where id = v_id;

  return v_id;
end $$;

revoke all on function registrar_egreso_stock(numeric, text, text, text, text, text) from public, anon;
grant execute on function registrar_egreso_stock(numeric, text, text, text, text, text) to authenticated;

