-- =========================================================
-- 0010: Productos pesables (venta por Kg / Gramos)
-- =========================================================
-- Contexto:
--  * El kiosco/almacén no vende sólo "unidades": verduras, frutas, fiambres y
--    comida por peso se venden por kilo (o gramos).
--  * `productos.stock` y `venta_items.cantidad` YA son numeric(12,3), así que
--    la base soporta 12.500 kg desde la 0001. Lo que faltaba era la SEMÁNTICA
--    (saber si un producto se vende por unidad o por kg) y que `registrar_venta`
--    aceptara cantidades decimales.
--
-- Qué hace esta migración:
--  1. Agrega el enum `unidad_venta` ('unit' | 'kg') y la columna
--     `productos.unidad_venta` (default 'unit': ningún producto existente
--     cambia de comportamiento).
--  2. `precio_venta` pasa a ser el precio base del tipo de venta:
--        unidad_venta = 'unit' → precio por unidad
--        unidad_venta = 'kg'   → precio por kilogramo
--     `stock` y `stock_minimo` quedan en unidades o en kg según el producto.
--  3. Reescribe `registrar_venta` (misma firma y mismo uuid de retorno):
--        - productos 'unit': la cantidad tiene que ser ENTERA (>= 1) → la
--          lógica de siempre, intacta;
--        - productos 'kg':   cantidad con hasta 3 decimales (> 0), en kg;
--        - el subtotal se redondea a centavos (0,350 kg × $6.000 = $2.100,00);
--        - el descuento de stock es `stock − cantidad` (decimal exacto).
--  4. Suma productos pesables de ejemplo (verdulería / fiambrería) para poder
--     probar el POS sin cargar nada a mano; no duplica los existentes.
--
-- Idempotente: se puede volver a correr sin romper nada.
-- =========================================================


-- ---------------------------------------------------------
-- 1. Tipo de venta del producto
-- ---------------------------------------------------------
do $$
begin
  create type unidad_venta as enum ('unit', 'kg');
exception
  when duplicate_object then null;
end $$;

alter table productos
  add column if not exists unidad_venta unidad_venta not null default 'unit';

comment on column productos.unidad_venta is
  'Cómo se vende el producto: ''unit'' = por unidad, ''kg'' = por peso (kilos/gramos).';
comment on column productos.precio_venta is
  'Precio de venta según unidad_venta: por unidad, o por kilogramo si es pesable.';
comment on column productos.stock is
  'Stock disponible: unidades si unidad_venta = ''unit'', kilos (3 decimales) si es ''kg''.';
comment on column productos.stock_minimo is
  'Alerta de stock mínimo, en la misma unidad que `stock`.';


-- ---------------------------------------------------------
-- 2. Helpers de comportamiento por tipo de venta
-- ---------------------------------------------------------
-- Un producto es pesable si y sólo si su tipo de venta es 'kg'.
create or replace function public.producto_es_pesable(p_producto uuid)
returns boolean language sql stable security invoker as $$
  select coalesce((select unidad_venta = 'kg' from productos where id = p_producto), false)
$$;

-- Normaliza la cantidad de una venta según el producto:
--   'kg'   → 3 decimales (gramos), > 0
--   'unit' → entero >= 1
-- Devuelve null si la cantidad no es válida para ese producto.
create or replace function public.cantidad_valida_venta(p_producto uuid, p_cantidad numeric)
returns numeric language sql stable security invoker as $$
  select case
    when p_cantidad is null or p_cantidad <= 0 then null
    when public.producto_es_pesable(p_producto) then round(p_cantidad, 3)
    when p_cantidad = trunc(p_cantidad) then p_cantidad
    else null
  end
$$;

revoke all on function public.producto_es_pesable(uuid) from public, anon;
revoke all on function public.cantidad_valida_venta(uuid, numeric) from public, anon;
grant execute on function public.producto_es_pesable(uuid) to authenticated;
grant execute on function public.cantidad_valida_venta(uuid, numeric) to authenticated;


-- ---------------------------------------------------------
-- 3. registrar_venta: acepta kilos y sigue validando unidades
-- ---------------------------------------------------------
-- Se mantiene todo lo de 0009 (turno del usuario, consolidación por producto,
-- un solo ingreso de caja por venta, marca `kiosco.venta` para no duplicar la
-- salida de stock en la bitácora). Sólo cambia la validación de cantidades:
-- las decimales se aceptan si el producto es pesable.
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

  -- Formato de los items: nunca se descuenta un precio, un total ni un número
  -- negativo/absurdo (ej. 2000 por 1). Se aceptan hasta 3 decimales (gramos).
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

  -- Se consolida por producto: si el carrito repite un producto, se descuenta
  -- una sola vez la suma de sus cantidades. La validez depende del tipo de
  -- venta del producto (enteros si es por unidad, hasta gramos si es por kg).
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

  -- Subtotal redondeado a centavos: 0,350 kg × $6.000 = $2.100,00 exactos.
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

  -- Descuento de stock: stock actual − cantidad vendida (decimal exacto en kg).
  -- La marca `kiosco.venta` evita que el trigger de bitácora de stock escriba
  -- otra línea: la salida va en los `items` del ingreso de caja (abajo).
  perform set_config('kiosco.venta', '1', true);
  update productos pr
     set stock = round(coalesce(pr.stock, 0) - s.cant, 3), updated_at = now()
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

revoke all on function registrar_venta(jsonb, metodo_pago, numeric, uuid) from public, anon;
grant execute on function registrar_venta(jsonb, metodo_pago, numeric, uuid) to authenticated;


-- ---------------------------------------------------------
-- 4. Vista de stock bajo: informativa, sirve igual para kg y unidades
-- ---------------------------------------------------------
create or replace view productos_stock_bajo with (security_invoker = true) as
select * from productos where activo and stock <= stock_minimo;


-- ---------------------------------------------------------
-- 5. Datos de ejemplo: productos pesables (verdulería / fiambrería)
-- ---------------------------------------------------------
-- Se reemplaza `cargar_datos_demo` (0002) sumando las categorías y los
-- productos por peso, con el precio por kg y el stock en kg. Se apoya en
-- `on conflict do nothing`, así que también es seguro sobre una base que ya
-- tenía los datos de ejemplo: sólo agrega lo que falta.
create or replace function cargar_datos_demo()
returns void language plpgsql as $$
declare c_gol uuid; c_beb uuid; c_sna uuid; c_cig uuid; c_fia uuid; c_ver uuid; v_cli uuid;
begin
  insert into categorias (nombre) values
    ('Golosinas'), ('Bebidas'), ('Snacks'), ('Cigarrillos'), ('Fiambrería'), ('Verdulería')
  on conflict (tenant_id, nombre) do nothing;
  select id into c_gol from categorias where nombre = 'Golosinas' limit 1;
  select id into c_beb from categorias where nombre = 'Bebidas' limit 1;
  select id into c_sna from categorias where nombre = 'Snacks' limit 1;
  select id into c_cig from categorias where nombre = 'Cigarrillos' limit 1;
  select id into c_fia from categorias where nombre = 'Fiambrería' limit 1;
  select id into c_ver from categorias where nombre = 'Verdulería' limit 1;

  insert into productos (categoria_id, codigo_barras, nombre, precio_costo, precio_venta, stock, stock_minimo, acceso_rapido) values
    (c_gol, '7790001', 'Alfajor Guaymallén',    270,  450, 45, 10, true),
    (c_beb, '7790002', 'Coca-Cola 500ml',       720, 1200, 45, 10, true),
    (c_gol, '7790003', 'Galletitas Oreo',       480,  800, 45, 10, false),
    (c_gol, '7790004', 'Caramelos Sueltos',      30,   50, 300, 50, true),
    (c_sna, '7790005', 'Papas Fritas',          900, 1500,  3,  5, false),
    (c_beb, '7790006', 'Agua Mineral 500ml',    420,  700, 45, 10, true),
    (c_gol, '7790007', 'Chicle Beldent',        360,  600, 45, 10, false),
    (c_cig, '7790008', 'Cigarrillos',          2500, 3200, 20, 10, true)
  on conflict (tenant_id, codigo_barras) do nothing;

  -- Pesables: precio por kg y stock en kg (con gramos).
  insert into productos
    (categoria_id, codigo_barras, nombre, precio_costo, precio_venta, stock, stock_minimo,
     acceso_rapido, emoji, unidad_venta)
  values
    (c_fia, 'PES0001', 'Queso Cremoso',         4200,  6000, 12.500,  2, true,  '🧀', 'kg'),
    (c_fia, 'PES0002', 'Jamón Cocido',          7800, 11000,  3.250,  1, false, '🥓', 'kg'),
    (c_ver, 'PES0003', 'Tomate Perita',         1200,  1800, 25.750,  5, true,  '🍅', 'kg'),
    (c_ver, 'PES0004', 'Manzana Red Delicious', 1500,  2200, 18.000,  5, false, '🍎', 'kg'),
    (c_ver, 'PES0005', 'Papa Negra',             900,  1400, 40.500, 10, false, '🥔', 'kg')
  on conflict (tenant_id, codigo_barras) do nothing;

  if not exists (select 1 from clientes) then
    insert into clientes (nombre, telefono) values ('Doña Marta', '11 5555-1020') returning id into v_cli;
    insert into movimientos_cuenta (cliente_id, tipo, monto, notas) values
      (v_cli, 'cargo', 5200, 'Leche, Pan, Alfajor x2'), (v_cli, 'cargo', 7800, 'Yerba, Azúcar'), (v_cli, 'pago', 4000, 'Pago a cuenta');
    insert into clientes (nombre, telefono) values ('Carlos (Taller)', '11 4444-3030'), ('Familia Pérez', '11 6666-4040'), ('Lucía G.', '11 7777-5050');
  end if;
end $$;

