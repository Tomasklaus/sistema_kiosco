// Tipos de dominio (reflejan supabase/migrations/0001_schema_inicial.sql).
// Más adelante se pueden reemplazar por `supabase gen types typescript`.
export type MetodoPago = "efectivo" | "mercadopago" | "tarjeta" | "cuenta_corriente";
/** Un egreso nunca se paga "a cuenta corriente". */
export type MetodoPagoEgreso = Exclude<MetodoPago, "cuenta_corriente">;
export type RolUsuario = "owner" | "admin" | "cajero";

/**
 * Cómo se vende un producto:
 * - `unit`: por unidad (alfajor, gaseosa). El stock está en unidades.
 * - `kg`:   por peso (fiambres, verduras). El precio es por kg y el stock en kg
 *           con hasta 3 decimales (gramos).
 */
export type UnidadVenta = "unit" | "kg";

export interface Categoria {
  id: string;
  tenant_id: string;
  nombre: string;
}

export interface Producto {
  id: string;
  tenant_id: string;
  categoria_id: string | null;
  codigo_barras: string | null;
  nombre: string;
  precio_costo: number;
  /** Precio por unidad, o por kg si `unidad_venta` es `"kg"`. */
  precio_venta: number;
  /** Stock en unidades, o en kg (3 decimales) si `unidad_venta` es `"kg"`. */
  stock: number;
  stock_minimo: number;
  /** Tipo de venta (migración 0010). */
  unidad_venta: UnidadVenta;
  acceso_rapido: boolean;
  activo: boolean;
  /** Emoji propio del producto. `null` = usar el de su categoría. */
  emoji: string | null;
}

export interface Cliente {
  id: string;
  tenant_id: string;
  nombre: string;
  telefono: string | null;
  limite_credito: number | null;
  saldo?: number;
}

export interface TurnoCaja {
  id: string;
  estado: "abierto" | "cerrado";
  monto_inicial: number;
  abierto_at: string;
  cerrado_at: string | null;
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Ítem del carrito. No tiene dependencias para poder tipar el store sin
 * arrastrar el cliente de Supabase.
 */
export interface CartItem {
  producto: Producto;
  /** Unidades (entero) o kilos con hasta 3 decimales si el producto es pesable. */
  cantidad: number;
}

export type ProductoUI = Producto & { categoria: string | null; emoji: string };

/** Categoría tal como se muestra en inventario: emoji por defecto y cantidad de productos. */
export type CategoriaConUso = {
  id: string;
  nombre: string;
  /** Cantidad de productos activos asignados. */
  productos: number;
  /** Emoji sugerido para sus productos (por nombre conocido o genérico). */
  emoji: string;
};

export type MovimientoCajaRow = {
  id: string;
  tipo: TipoMovCaja;
  metodo_pago: MetodoPago;
  monto: number;
  descripcion: string | null;
  created_at: string;
};

/** Tipos de movimiento que maneja la bitácora (incluye las notas de stock). */
export type TipoMovCaja =
  | "ingreso_venta"
  | "ingreso_cobro_deuda"
  | "ingreso_manual"
  | "egreso_proveedor"
  | "egreso_manual"
  | "egreso_anulacion"
  | "nota_stock";

/** Un elemento movido dentro de un movimiento de caja o de stock. */
export interface ItemMovimiento {
  producto_id: string;
  nombre: string;
  /** Positivo = entró, negativo = salió. */
  cantidad: number;
  motivo: string;
}

/** Fila completa de la bitácora (vista dueño/admin). */
export interface MovimientoBitacora {
  id: string;
  turno_id: string;
  created_at: string;
  tipo: TipoMovCaja;
  metodo_pago: MetodoPago;
  monto: number;
  descripcion: string | null;
  detalle: string | null;
  forma_pago: string | null;
  referencia: string | null;
  /** El egreso vino con mercadería (ingreso de stock). */
  stock_involucrado: boolean;
  items: ItemMovimiento[] | null;
  usuario_id: string;
  usuario: string;
  venta_id: string | null;
}

/** Ingreso de stock registrado en un turno, para cruzar con los egresos. */
export interface IngresoStockRow {
  movimiento_id: string;
  created_at: string;
  usuario_id: string;
  usuario: string;
  descripcion: string | null;
  referencia: string | null;
  items: ItemMovimiento[];
}

/** Turno disponible para filtrar la bitácora. */
export interface TurnoBitacora {
  id: string;
  abierto_at: string;
  cerrado_at: string | null;
  estado: "abierto" | "cerrado";
  usuario: string;
  monto_inicial: number;
  diferencia: number | null;
}

export type RangoBitacora = "hoy" | "ayer" | "7d" | "mes" | "todo";

export interface BitacoraData {
  rango: RangoBitacora;
  desde: string;
  /** false = no se pudieron leer las columnas nuevas de la migración 0008. */
  migrado: boolean;
  /** Mensaje de la base cuando la lectura falló (para diagnosticar). */
  error?: string | null;
  movimientos: MovimientoBitacora[];
  /** Ingresos de stock de los turnos incluidos, agrupados por turno. */
  ingresos: IngresoStockRow[];
  turnos: TurnoBitacora[];
  operadores: { id: string; nombre: string }[];
  totales: {
    ingresos: number;
    egresos: number;
    /** Egresos que vinieron con ingreso de stock. */
    egresosConStock: number;
    cantidadMovimientos: number;
  };
}

export interface CajaData {
  turno: TurnoCaja;
  movimientos: MovimientoCajaRow[];
}

export interface MovCuentaRow {
  id: string;
  tipo: "cargo" | "pago";
  monto: number;
  notas: string | null;
  created_at: string;
}

export interface ClienteConMovs {
  id: string;
  nombre: string;
  telefono: string | null;
  movimientos_cuenta: MovCuentaRow[];
}

export interface ReporteData {
  total: number;
  horas: number[]; // 24 posiciones, monto vendido por hora
  pagos: Record<MetodoPago, number>;
  topUnidades: [string, number][];
  topRentabilidad: [string, number][];
}
