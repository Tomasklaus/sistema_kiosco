-- =========================================================
-- 0011: Método de pago de los egresos (efectivo vs. transferencia / Mercado Pago)
-- =========================================================
-- Contexto:
--  * Los comercios le pagan a proveedores y servicios tanto en efectivo (sale
--    plata de la caja física) como por transferencia bancaria / Mercado Pago.
--  * Hasta acá TODO egreso entraba a movimientos_caja con metodo_pago
--    = 'efectivo'. Al cerrar el turno, cerrar_turno restaba esos pagos del
--    "Efectivo Esperado en Caja" y el arqueo mostraba un faltante falso.
--  * Ahora cada egreso guarda su método real:
--      - 'efectivo'      → sale de la caja física (resta del esperado).
--      - 'mercadopago'   → transferencia / Mercado Pago (gasto del negocio que
--                          NO toca el efectivo de la caja).
--    (Se reutiliza el enum metodo_pago de la migración 0001: el valor
--    'mercadopago' abarca transferencia bancaria, Mercado Pago y billeteras.)
--
-- Consecuencias:
--  1. registrar_egreso / registrar_egreso_stock aceptan p_metodo_pago y lo
--     guardan en el movimiento.
--  2. cerrar_turno calcula contra valores positivos (monto de cada tipo) y
--     sólo suma/resta los movimientos con metodo_pago = 'efectivo' y tipo que
--     mueve dinero. Las notas de stock (monto $1, sin dinero) se excluyen.
--  3. Los egresos que ya estaban cargados no tienen medio registrado: siguen
--     contando como efectivo (comportamiento histórico).
--
-- Idempotente: se puede volver a correr sin romper nada.

begin;

-- No queda sobrecarga: PostgREST no distingue versiones con defaults y una
-- llamada quedaría ambigua ("is not unique"). Se reemplaza la versión de 0008
-- (7 argumentos) por la de 0011 (8 argumentos).
drop function if exists registrar_egreso(numeric, text, text, boolean, jsonb, text, text);
drop function if exists registrar_egreso(numeric, text, text, boolean, jsonb, text, text, text);
drop function if exists registrar_egreso_stock(numeric, text, text, text, text, text);
drop function if exists registrar_egreso_stock(numeric, text, text, text, text, text, text);

-- ---------------------------------------------------------
-- 1. ¿Este tipo de movimiento mueve dinero?
-- ---------------------------------------------------------
-- 'nota_stock' documenta un cambio de stock con monto simbólico de $0,01:
-- no entra ni sale nada de la caja.
create or replace function public.mov_tipo_mueve_dinero(p_tipo tipo_mov_caja)
returns boolean language sql immutable as $$
  select p_tipo::text <> 'nota_stock'
$$;


-- ---------------------------------------------------------
-- 2. Aporte de un movimiento de caja al efectivo del turno
-- ---------------------------------------------------------
--  +  los ingresos cobrados en efectivo
--  −  los egresos pagados en efectivo (egresos, compras, anulaciones)
--  Sólo 'efectivo': los cobros por Mercado Pago / tarjeta y los pagos por
--  transferencia son movimientos del negocio, pero no tocan los billetes.
create or replace function public.mov_aporte_efectivo(
  p_tipo tipo_mov_caja,
  p_metodo metodo_pago,
  p_monto numeric
) returns numeric language sql immutable as $$
  select case
           when p_metodo::text <> 'efectivo' then 0::numeric
           when not mov_tipo_mueve_dinero(p_tipo) then 0::numeric
           when p_tipo::text like 'ingreso%' then coalesce(p_monto, 0)
           else -coalesce(p_monto, 0)
         end
$$;


-- ---------------------------------------------------------
-- 3. registrar_egreso: guarda el método de pago del egreso
-- ---------------------------------------------------------
-- Misma firma que la de 0008 más p_metodo_pago (con default: las llamadas
-- viejas siguen funcionando y pagando en efectivo).
create or replace function registrar_egreso(
  p_monto numeric,
  p_concepto text,
  p_detalle text default null,
  p_stock_involucrado boolean default false,
  p_items jsonb default null,
  p_referencia text default null,
  p_forma_pago text default 'efectivo',
  p_metodo_pago text default 'efectivo'
) returns uuid language plpgsql as $$
declare
  v_turno uuid; v_id uuid; v_desc text; v_detalle text; v_ref text;
  v_metodo metodo_pago;
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

  -- Transferencia bancaria, Mercado Pago y billeteras comparten el valor
  -- 'mercadopago'. Cualquier otro valor (o ninguno) es efectivo.
  v_metodo := case
                when lower(btrim(coalesce(p_metodo_pago, '')))
                     in ('mercadopago', 'transferencia', 'mp', 'digital')
                  then 'mercadopago'::metodo_pago
                else 'efectivo'::metodo_pago
              end;

  insert into movimientos_caja
    (turno_id, tipo, metodo_pago, monto, descripcion,
     stock_involucrado, items, forma_pago, detalle, referencia)
  values
    (v_turno, 'egreso_proveedor', v_metodo, p_monto, left(v_desc, 500),
     coalesce(p_stock_involucrado, false), p_items,
     nullif(btrim(coalesce(p_forma_pago, '')), ''), v_detalle, v_ref)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un egreso con esa referencia (¿comprobante repetido?)';
end $$;

revoke all on function registrar_egreso(numeric, text, text, boolean, jsonb, text, text, text) from public, anon;
grant execute on function registrar_egreso(numeric, text, text, boolean, jsonb, text, text, text) to authenticated;


-- ---------------------------------------------------------
-- 4. registrar_egreso_stock: idem, con método de pago
-- ---------------------------------------------------------
create or replace function registrar_egreso_stock(
  p_monto numeric,
  p_concepto text,
  p_detalle text default null,
  p_motivo text default 'compra_proveedor',
  p_referencia text default null,
  p_forma_pago text default 'efectivo',
  p_metodo_pago text default 'efectivo'
) returns uuid language plpgsql as $$
declare v_id uuid; v_det text;
begin
  v_det := nullif(btrim(coalesce(p_detalle, '')), '');

  -- Llamada con nombres (y sin sobrecarga tras el drop): el 8º argumento deja
  -- el método de pago en el movimiento.
  v_id := registrar_egreso(
    p_monto => p_monto,
    p_concepto => p_concepto,
    p_detalle => v_det,
    p_stock_involucrado => true,
    p_items => null,
    p_referencia => p_referencia,
    p_forma_pago => p_forma_pago,
    p_metodo_pago => p_metodo_pago);

  -- Deja dicho qué tipo de ingreso de mercadería respalda el egreso.
  update movimientos_caja
     set detalle = trim(both E'\n' from
           concat_ws(E'\n', nullif(detalle, ''), 'Ingreso de stock: ' || coalesce(nullif(p_motivo, ''), 'compra_proveedor')))
   where id = v_id;

  return v_id;
end $$;

revoke all on function registrar_egreso_stock(numeric, text, text, text, text, text, text) from public, anon;
grant execute on function registrar_egreso_stock(numeric, text, text, text, text, text, text) to authenticated;


-- ---------------------------------------------------------
-- 5. cerrar_turno: el arqueo sólo cuenta el efectivo real
-- ---------------------------------------------------------
-- Antes restaba TODOS los egresos con metodo_pago 'efectivo' (y sumaba las
-- notas de stock de $0,01). Ahora:
--   efectivo esperado = fondo inicial + ingresos en efectivo − egresos en efectivo
-- Los pagos por transferencia / Mercado Pago quedan en la bitácora como gasto
-- del negocio, pero no descuentan del saldo físico.
create or replace function cerrar_turno(p_efectivo_contado numeric)
returns jsonb language plpgsql as $$
declare v_t turnos_caja; v_esperado numeric(12,2);
begin
  select * into v_t from turnos_caja where estado = 'abierto' and usuario_apertura = auth.uid();
  if v_t.id is null then raise exception 'No tenés un turno abierto'; end if;

  select v_t.monto_inicial
         + coalesce(sum(mov_aporte_efectivo(tipo, metodo_pago, monto)), 0)
    into v_esperado
    from movimientos_caja where turno_id = v_t.id;

  update turnos_caja set estado = 'cerrado', cerrado_at = now(), usuario_cierre = auth.uid(),
         efectivo_esperado = v_esperado, efectivo_contado = p_efectivo_contado,
         diferencia = p_efectivo_contado - v_esperado
   where id = v_t.id;

  return jsonb_build_object('esperado', v_esperado, 'contado', p_efectivo_contado,
                            'diferencia', p_efectivo_contado - v_esperado);
end $$;

revoke all on function cerrar_turno(numeric) from public, anon;
grant execute on function cerrar_turno(numeric) to authenticated;


-- ---------------------------------------------------------
-- 6. Cambios de stock desde Inventario: con qué se pagó
-- ---------------------------------------------------------
-- La app manda el medio ANTES de guardar el producto; el trigger de bitácora
-- (bitacora_stock_desde_producto) lo usa para la nota de stock. Sin este dato
-- el medio es efectivo, igual que en la migración 0008.
create or replace function public.set_bitacora_metodo_pago(p_metodo_pago text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('kiosco.metodo_pago_stock', coalesce(nullif(btrim(p_metodo_pago), ''), ''), true);
end $$;

revoke all on function set_bitacora_metodo_pago(text) from public, anon;
grant execute on function set_bitacora_metodo_pago(text) to authenticated;


-- El trigger crea una nota de stock con el medio que eligió el usuario: un
-- egreso por transferencia / MP deja el efectivo de la caja intacto.
create or replace function public.metodo_pago_stock_actual()
returns metodo_pago language sql stable as $$
  select case
           when lower(coalesce(nullif(current_setting('kiosco.metodo_pago_stock', true), ''), 'efectivo'))
                in ('mercadopago', 'transferencia', 'mp', 'digital')
             then 'mercadopago'::metodo_pago
           else 'efectivo'::metodo_pago
         end
$$;

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

-- La nota de stock hereda el medio de pago elegido (efectivo por defecto).
-- Se reescribe el movimiento recién creado dentro de la misma transacción.
create or replace function bitacora_stock_medio_pago()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.tipo = 'nota_stock' and metodo_pago_stock_actual() <> 'efectivo' then
    update movimientos_caja
       set metodo_pago = metodo_pago_stock_actual()
     where id = new.id;
  end if;
  return new;
end $fn$;

drop trigger if exists trg_bitacora_stock_medio on movimientos_caja;
create trigger trg_bitacora_stock_medio
  after insert on movimientos_caja
  for each row execute function bitacora_stock_medio_pago();

commit;



