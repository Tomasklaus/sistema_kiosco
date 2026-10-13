-- =========================================================
-- 0002: FUNCIONES TRANSACCIONALES (RPC) Y DATOS DE EJEMPLO
-- Todas son SECURITY INVOKER: RLS limita todo al tenant del usuario.
-- =========================================================

-- Abrir turno ------------------------------------------------
create or replace function abrir_turno(p_monto_inicial numeric default 0)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  if exists (select 1 from turnos_caja where estado = 'abierto') then
    raise exception 'Ya hay un turno abierto';
  end if;
  insert into turnos_caja (monto_inicial) values (coalesce(p_monto_inicial, 0)) returning id into v_id;
  return v_id;
end $$;

-- Registrar venta (atómica) -----------------------------------
-- p_items: [{"producto_id": "...", "cantidad": 2}, ...]  (el precio se lee de la BD)
create or replace function registrar_venta(
  p_items jsonb,
  p_metodo metodo_pago,
  p_monto_recibido numeric default null,
  p_cliente_id uuid default null
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_total numeric(12,2); v_venta uuid; v_vuelto numeric(12,2);
begin
  select id into v_turno from turnos_caja where estado = 'abierto';
  if v_turno is null then raise exception 'No hay un turno de caja abierto'; end if;
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

-- Egreso de caja (pago a proveedor, retiro) ---------------------
create or replace function registrar_egreso(p_monto numeric, p_concepto text)
returns uuid language plpgsql as $$
declare v_turno uuid; v_id uuid;
begin
  select id into v_turno from turnos_caja where estado = 'abierto';
  if v_turno is null then raise exception 'No hay un turno de caja abierto'; end if;
  insert into movimientos_caja (turno_id, tipo, metodo_pago, monto, descripcion)
  values (v_turno, 'egreso_proveedor', 'efectivo', p_monto, p_concepto) returning id into v_id;
  return v_id;
end $$;

-- Cerrar turno con arqueo -------------------------------------------
create or replace function cerrar_turno(p_efectivo_contado numeric)
returns jsonb language plpgsql as $$
declare v_t turnos_caja; v_esperado numeric(12,2);
begin
  select * into v_t from turnos_caja where estado = 'abierto';
  if v_t.id is null then raise exception 'No hay un turno abierto'; end if;

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

-- Cuenta corriente: sumar deuda manual o registrar pago -----------------
create or replace function registrar_mov_cuenta(
  p_cliente uuid, p_tipo tipo_mov_cuenta, p_monto numeric,
  p_notas text default null, p_metodo metodo_pago default 'efectivo'
) returns uuid language plpgsql as $$
declare v_id uuid; v_turno uuid;
begin
  insert into movimientos_cuenta (cliente_id, tipo, monto, notas, metodo_pago)
  values (p_cliente, p_tipo, p_monto, p_notas, case when p_tipo = 'pago' then p_metodo end)
  returning id into v_id;

  -- Un cobro de deuda entra a la caja del turno abierto (si lo hay)
  if p_tipo = 'pago' then
    select id into v_turno from turnos_caja where estado = 'abierto';
    if v_turno is not null then
      insert into movimientos_caja (turno_id, tipo, metodo_pago, monto, descripcion)
      values (v_turno, 'ingreso_cobro_deuda', p_metodo, p_monto,
              'Cobro de cuenta corriente: ' || (select nombre from clientes where id = p_cliente));
    end if;
  end if;
  return v_id;
end $$;

-- Alerta de stock bajo ----------------------------------------------------
create or replace view productos_stock_bajo with (security_invoker = true) as
select * from productos where activo and stock <= stock_minimo;

-- Datos de ejemplo para el tenant del usuario logueado ----------------------
create or replace function cargar_datos_demo()
returns void language plpgsql as $$
declare c_gol uuid; c_beb uuid; c_sna uuid; c_cig uuid; v_cli uuid;
begin
  insert into categorias (nombre) values ('Golosinas'), ('Bebidas'), ('Snacks'), ('Cigarrillos')
  on conflict (tenant_id, nombre) do nothing;
  select id into c_gol from categorias where nombre = 'Golosinas';
  select id into c_beb from categorias where nombre = 'Bebidas';
  select id into c_sna from categorias where nombre = 'Snacks';
  select id into c_cig from categorias where nombre = 'Cigarrillos';

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

  if not exists (select 1 from clientes) then
    insert into clientes (nombre, telefono) values ('Doña Marta', '11 5555-1020') returning id into v_cli;
    insert into movimientos_cuenta (cliente_id, tipo, monto, notas) values
      (v_cli, 'cargo', 5200, 'Leche, Pan, Alfajor x2'), (v_cli, 'cargo', 7800, 'Yerba, Azúcar'), (v_cli, 'pago', 4000, 'Pago a cuenta');
    insert into clientes (nombre, telefono) values ('Carlos (Taller)', '11 4444-3030'), ('Familia Pérez', '11 6666-4040'), ('Lucía G.', '11 7777-5050');
  end if;
end $$;
