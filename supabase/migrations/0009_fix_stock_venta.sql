-- =========================================================
-- 0009: Corrección del descuento de stock y de la bitácora al vender
-- =========================================================
-- Contexto del cambio (bug en POS):
--  * Al cobrar una venta la bitácora mostraba líneas de stock duplicadas
--    ("Egreso de stock: jugo estancia (-2.000)") con monto $1. Motivo: sobre
--    `productos` había DOS triggers reaccionando al mismo UPDATE ... SET stock
--    de `registrar_venta`:
--      1. bitacora_stock_desde_producto (0008) → escribía una nota_stock
--         como si fuese un ajuste manual (no reconocía `kiosco.venta`).
--      2. bitacora_stock_por_venta (0008) → escribía OTRA nota_stock y además
--         la colgaba de la última venta de los últimos 5 minutos (podía ser de
--         otra operación).
--    Una sola venta dejaba dos líneas de stock, una de ellas fantasma.
--
-- Qué hace esta migración:
--  1. Deja UN solo trigger de bitácora de stock sobre `productos` y elimina
--     bitacora_stock_por_venta.
--  2. `registrar_venta` marca la transacción como venta (`kiosco.venta = '1'`)
--     para que ese trigger no escriba una salida: la salida queda, con la
--     cantidad exacta, en los `items` del ingreso de caja de la venta
--     (un solo movimiento de caja por venta).
--  3. `registrar_venta` valida las cantidades (numéricas, >= 1), las consolida
--     por producto y descuenta SIEMPRE `stock actual − cantidad comprada`.
--  4. Las notas de stock son informativas: no mueven dinero. `movimientos_caja`
--     exige monto > 0 (0001), así que se guardan con monto 1 (centavos, igual
--     que hacía 0008) y la UI las muestra como "sin dinero" y las excluye de
--     los totales de caja.
--  5. `ajustar_stock` ya NO vuelve a tocar el stock cuando lo llama el trigger
--     (antes se re-disparaba a sí mismo y el handler de excepción lo tapaba:
--     el stock quedaba mal y la bitácora, vacía).
--  6. anular_venta enlaza su egreso con la venta (venta_id) para que el
--     historial muestre la anulación junto a la venta.
--  7. Repara el stock que quedó negativo por el bug (sección 9).
--
-- Idempotente: se puede volver a correr sin romper nada.
-- IMPORTANTE: la reparación de stock histórico corre una sola vez.


-- ---------------------------------------------------------
-- 1. Helpers de formato de cantidades
-- ---------------------------------------------------------
--  2000 → '2000'   |   1.5 → '1,5'   |   -2 → '−2' (formato AR)
create or replace function public.formato_cantidad(p_cantidad numeric)
returns text language sql immutable as $$
  select replace(replace(
           trim(trailing '.' from trim(trailing '0' from
             to_char(coalesce(p_cantidad, 0), 'FM999999999999990.999'))),
           '.', ','), '-', '−')
$$;


-- ---------------------------------------------------------
-- 2. Una sola fila de bitácora por operación de stock
-- ---------------------------------------------------------
-- Si ya existe un movimiento con la misma referencia se reutiliza (se actualizan
-- sus líneas) en lugar de insertar otra fila: nunca dos filas por la misma
-- operación.
create or replace function public.registrar_nota_stock(
  p_tenant uuid,
  p_turno uuid,
  p_descripcion text,
  p_items jsonb,
  p_stock_involucrado boolean default false,
  p_detalle text default null,
  p_referencia text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(jsonb_array_length(p_items), 0) = 0 then return null; end if;

  if p_referencia is not null then
    update movimientos_caja
       set items = bitacora_merge_items(items, p_items),
           descripcion = left(coalesce(p_descripcion, descripcion), 500),
           stock_involucrado = stock_involucrado or coalesce(p_stock_involucrado, false)
     where tenant_id = p_tenant and referencia = p_referencia
    returning id into v_id;
    if v_id is not null then return v_id; end if;
  end if;

  -- OJO: movimientos_caja tiene "check (monto > 0)" (migración 0001), por eso
  -- monto = 1 (centavos). La nota no mueve dinero: la UI la muestra como
  -- "sin dinero" y la excluye de los totales.
  insert into movimientos_caja
    (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion,
     items, stock_involucrado, detalle, referencia)
  values
    (p_tenant, p_turno, 'nota_stock', 'efectivo', 1, left(p_descripcion, 500),
     p_items, coalesce(p_stock_involucrado, false), p_detalle, p_referencia)
  returning id into v_id;

  return v_id;
end $$;


-- ---------------------------------------------------------
-- 3. ajustar_stock: el ÚNICO camino de escritura de bitácora de stock
-- ---------------------------------------------------------
-- En modo bitácora el trigger sobre `productos` ya cambió/va a cambiar el stock:
-- no se vuelve a tocar (si no, el trigger se re-dispara a sí mismo).
create or replace function ajustar_stock(
  p_producto uuid,
  p_cantidad numeric,
  p_motivo text default 'ajuste_manual',
  p_detalle text default null,
  p_afecta_caja boolean default false,
  p_movimiento uuid default null,
  p_referencia text default null
) returns uuid language plpgsql as $fn$
declare
  v_turno uuid; v_prod productos; v_tenant uuid;
  v_ref text; v_det text; v_linea jsonb;
  v_trigger boolean;
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

  -- ¿Nos llama el trigger de bitácora? (ver bitacora_stock_desde_producto)
  v_trigger := nullif(current_setting('kiosco.bitacora_stock', true), '') = '1';
  if v_trigger then
    perform set_config('kiosco.bitacora_stock', '0', true);
  end if;

  -- El stock cambia por SUMA/RESTA de la cantidad, nunca de otra cosa.
  -- En modo trigger el stock ya cambió (o es el AFTER): no se vuelve a sumar.
  if not v_trigger then
    update productos set stock = coalesce(stock, 0) + p_cantidad, updated_at = now()
     where id = p_producto;
  end if;

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

  return registrar_nota_stock(
    v_tenant, v_turno,
    (case when p_cantidad > 0 then 'Ingreso de stock: ' else 'Egreso de stock: ' end)
      || v_prod.nombre || ' ('
      || case when p_cantidad > 0 then '+' else '−' end
      || formato_cantidad(abs(p_cantidad)) || ')',
    v_linea,
    coalesce(p_afecta_caja, false) or p_cantidad > 0,
    v_det,
    -- Referencias repetidas (alta + carga, comprobante) no deben frenar el cambio.
    case when exists (select 1 from movimientos_caja m
                       where m.tenant_id = v_tenant and m.referencia = v_ref)
         then v_ref || ':' || gen_random_uuid()::text
         else v_ref end);
end $fn$;


-- ---------------------------------------------------------
-- 5. Cambios de stock desde la app (POS, editar producto, inventario)
-- ---------------------------------------------------------
create or replace function bitacora_stock_desde_producto()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_delta numeric; v_motivo text; v_caja boolean;
begin
  -- Re-entrada: `ajustar_stock` no vuelve a tocar el stock en modo bitácora,
  -- pero si algo cambiara `stock` mientras escribimos la bitácora, esta rama
  -- corta la recursión.
  if nullif(current_setting('kiosco.bitacora_stock', true), '') = '1' then return new; end if;

  v_delta := coalesce(new.stock, 0) - coalesce(old.stock, 0);
  if v_delta = 0 then return new; end if;

  -- Las ventas/anulaciones marcan `kiosco.venta` y escriben su propia línea de
  -- stock (registrar_venta en el ingreso de caja; anular_venta en su nota).
  if nullif(current_setting('kiosco.venta', true), '') = '1' then return new; end if;

  v_motivo := nullif(current_setting('kiosco.motivo_stock', true), '');
  if v_motivo is null then
    v_motivo := case when v_delta > 0 then 'ingreso_stock' else 'ajuste_manual' end;
  end if;
  v_caja := coalesce(nullif(current_setting('kiosco.afecta_caja', true), '')::boolean, v_delta > 0);

  -- El stock ya cambió: le avisamos a ajustar_stock que NO lo vuelva a sumar.
  perform set_config('kiosco.bitacora_stock', '1', true);
  begin
    perform ajustar_stock(
      new.id, v_delta, v_motivo,
      nullif(current_setting('kiosco.detalle_stock', true), ''),
      v_caja, null, nullif(current_setting('kiosco.referencia_stock', true), ''));
  exception when others then
    -- Un problema al escribir la bitácora no debe romper el cambio de stock,
    -- pero queda visible en los logs para poder diagnosticarlo.
    raise warning 'Bitácora de stock no registrada (producto %): %', new.id, sqlerrm;
  end;
  perform set_config('kiosco.bitacora_stock', '0', true);
  return new;
end $fn$;

-- Un solo trigger de bitácora de stock sobre productos.
-- El de 0008 (`bitacora_stock_por_venta`) duplicaba cada salida y la colgaba de
-- la última venta de los 5 minutos anteriores: se elimina.
drop trigger if exists trg_bitacora_stock_venta on productos;
drop function if exists bitacora_stock_por_venta();

drop trigger if exists trg_bitacora_stock_producto on productos;
create trigger trg_bitacora_stock_producto
  after update of stock on productos
  for each row execute function bitacora_stock_desde_producto();


-- ---------------------------------------------------------
-- 6. Venta: el movimiento de caja deja las salidas de stock exactas
-- ---------------------------------------------------------
-- OJO: este trigger es AFTER INSERT ON ventas, y en ese momento venta_items
-- todavía está vacía (registrar_venta la carga después), así que por sí solo no
-- puede escribir la salida de stock. Se mantiene instalado por compatibilidad
-- (puede completar el ingreso de una venta insertada junto con sus items), pero
-- las salidas de stock las escribe registrar_venta (punto 7) en los `items` de
-- ese mismo ingreso de caja.
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


-- ---------------------------------------------------------
-- 7. registrar_venta: valida cantidades y descuenta exactamente lo vendido
-- ---------------------------------------------------------
create or replace function registrar_venta(
  p_items jsonb,
  p_metodo metodo_pago,
  p_monto_recibido numeric default null,
  p_cliente_id uuid default null
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_total numeric(12,2); v_venta uuid; v_vuelto numeric(12,2);
  v_items jsonb; v_invalidas integer;
begin
  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then raise exception 'No tenés un turno de caja abierto'; end if;
  if p_metodo = 'cuenta_corriente' and p_cliente_id is null then
    raise exception 'Una venta a cuenta requiere cliente';
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  -- Cantidades válidas: numéricas, positivas y de al menos una unidad. Nunca se
  -- descuenta un precio, un total ni un número negativo/absurdo (ej. 2000 por 1).
  if exists (
    select 1 from jsonb_array_elements(p_items) i
     where i->>'producto_id' is null
        or (i->>'producto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (i->>'cantidad') is null
        or (i->>'cantidad') !~ '^[0-9]+(\.[0-9]+)?$'
        or (i->>'cantidad')::numeric <= 0
  ) then
    raise exception 'Hay items con una cantidad inválida en la venta';
  end if;

  -- Se consolida por producto: si el carrito repite un producto, se descuenta
  -- una sola vez la suma de sus unidades.
  select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cantidad', cantidad)),
         count(*) filter (where cantidad <= 0)
    into v_items, v_invalidas
    from (select (i->>'producto_id')::uuid as producto_id, sum((i->>'cantidad')::numeric) as cantidad
            from jsonb_array_elements(p_items) i
           group by 1) s;
  if v_invalidas > 0 then raise exception 'Hay items con una cantidad inválida en la venta'; end if;

  select sum(p.precio_venta * (i->>'cantidad')::numeric) into v_total
    from jsonb_array_elements(v_items) i
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
    from jsonb_array_elements(v_items) i
    join productos p on p.id = (i->>'producto_id')::uuid;

  -- Descuento de stock: stock actual − cantidad comprada.
  -- La marca `kiosco.venta` evita que el trigger de bitácora de stock escriba
  -- otra línea: la salida va en los `items` del ingreso de caja (abajo).
  perform set_config('kiosco.venta', '1', true);
  update productos pr set stock = coalesce(pr.stock, 0) - s.cant, updated_at = now()
    from (select (i->>'producto_id')::uuid as id, sum((i->>'cantidad')::numeric) as cant
            from jsonb_array_elements(v_items) i group by 1) s
   where pr.id = s.id;
  perform set_config('kiosco.venta', '', true);

  -- Un único movimiento de caja por venta, con sus salidas de stock exactas.
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
-- 8. Anular venta: devuelve stock sin dejar líneas duplicadas
-- ---------------------------------------------------------
create or replace function anular_venta(p_venta uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_venta ventas; v_turno uuid; v_items jsonb; v_motivo text;
begin
  select * into v_venta from ventas
   where id = p_venta and tenant_id = current_tenant_id() for update;
  if v_venta.id is null then raise exception 'Venta no encontrada'; end if;
  if v_venta.estado = 'anulada' then raise exception 'La venta ya fue anulada'; end if;

  -- Sólo dueño/admin anulan ventas (la UI ya limita el botón a la bitácora).
  if not puede_ver_bitacora() then
    raise exception 'No tenés permisos para anular ventas';
  end if;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  select jsonb_agg(jsonb_build_object(
           'producto_id', vi.producto_id,
           'nombre', vi.nombre_producto,
           'cantidad', vi.cantidad,
           'motivo', 'anulacion') order by vi.nombre_producto)
    into v_items
    from venta_items vi where vi.venta_id = v_venta.id;

  -- Devolver el stock (marcado como operación de venta para que el trigger de
  -- stock no lo tome como otra entrada).
  perform set_config('kiosco.venta', '1', true);
  update productos p
     set stock = coalesce(p.stock, 0) + s.cant, updated_at = now()
    from (select producto_id, sum(cantidad) as cant
            from venta_items where venta_id = v_venta.id group by 1) s
   where p.id = s.producto_id;
  perform set_config('kiosco.venta', '', true);

  update ventas set estado = 'anulada' where id = v_venta.id;

  if v_venta.metodo_pago <> 'cuenta_corriente' then
    -- El egreso queda enlazado a la venta (venta_id) y con su referencia de
    -- origen. Es idempotente: si ya existe, no se duplica.
    insert into movimientos_caja
      (tenant_id, turno_id, tipo, metodo_pago, monto, descripcion, items, venta_id, referencia)
    select v_venta.tenant_id, v_venta.turno_id, 'egreso_anulacion', v_venta.metodo_pago, v_venta.total,
           left('Anulación de venta' || coalesce(' — ' || v_motivo, ''), 500),
           coalesce(v_items, '[]'::jsonb), v_venta.id, 'venta-anulada:' || v_venta.id::text
     where not exists (select 1 from movimientos_caja m
                        where m.tenant_id = v_venta.tenant_id
                          and m.tipo::text = 'egreso_anulacion'
                          and m.venta_id = v_venta.id);
  else
    insert into movimientos_cuenta (cliente_id, tipo, monto, venta_id, notas)
    values (v_venta.cliente_id, 'pago', v_venta.total, v_venta.id, 'Anulación de venta');
  end if;

  select id into v_turno from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_turno is null then v_turno := v_venta.turno_id; end if;

  perform registrar_nota_stock(
    v_venta.tenant_id, v_turno,
    left('Devolución de stock por venta anulada' || coalesce(' (' || v_motivo || ')', ''), 500),
    coalesce(v_items, '[]'::jsonb), false, null,
    'venta-reversion:' || v_venta.id::text);

  return jsonb_build_object('venta', v_venta.id, 'items', coalesce(v_items, '[]'::jsonb));
end $$;

revoke all on function anular_venta(uuid, text) from public, anon;
grant execute on function anular_venta(uuid, text) to authenticated;


grant execute on function public.formato_cantidad(numeric) to authenticated;
grant execute on function public.registrar_nota_stock(uuid, uuid, text, jsonb, boolean, text, text) to authenticated;


-- ---------------------------------------------------------
-- 9. Reparación de stock negativo por el bug (una sola vez)
-- ---------------------------------------------------------
-- El descuento real lo hace `registrar_venta`; lo que dejó stock negativo fue
-- vender más de lo que había (no había validación) y las líneas duplicadas de
-- la bitácora. Para cada producto con stock negativo se reconstruye el stock a
-- partir del último ingreso registrado y de las ventas reales posteriores a esa
-- fecha, de modo que una unidad vendida nunca valga miles.
do $$
declare v_fix integer;
begin
  with ultimo as (
    select m.tenant_id, (it->>'producto_id')::uuid as producto_id,
           max(m.created_at) as desde
      from movimientos_caja m
     cross join lateral jsonb_array_elements(coalesce(m.items, '[]'::jsonb)) it
     where m.tipo = 'nota_stock'
       and (it->>'producto_id') ~* '^[0-9a-f-]{36}$'
       and coalesce((it->>'cantidad')::numeric, 0) > 0
     group by 1, 2
  ), base as (
    select p.id as producto_id,
           coalesce((
             select sum((it->>'cantidad')::numeric)
               from movimientos_caja m
              cross join lateral jsonb_array_elements(coalesce(m.items, '[]'::jsonb)) it
              where m.tipo = 'nota_stock'
                and m.tenant_id = p.tenant_id
                and (it->>'producto_id') = p.id::text
                and coalesce((it->>'cantidad')::numeric, 0) > 0
                and m.created_at = u.desde
           ), 0) as ingreso,
           coalesce((
             select sum(vi.cantidad)
               from venta_items vi
               join ventas v on v.id = vi.venta_id
              where vi.producto_id = p.id
                and coalesce(v.estado, 'completada') <> 'anulada'
                and v.created_at > u.desde
           ), 0) as vendido
      from productos p
      join ultimo u on u.tenant_id = p.tenant_id and u.producto_id = p.id
     where p.stock < 0
  )
  update productos p
     set stock = greatest(base.ingreso - base.vendido, 0), updated_at = now()
    from base
   where p.id = base.producto_id;

  get diagnostics v_fix = row_count;
  if v_fix > 0 then
    raise notice 'Stock reparado en % producto(s) con stock negativo.', v_fix;
  end if;
end $$;
