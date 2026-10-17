// Tipos de dominio (reflejan supabase/migrations/0001_schema_inicial.sql).
// Más adelante se pueden reemplazar por `supabase gen types typescript`.
export type MetodoPago = "efectivo" | "mercadopago" | "tarjeta" | "cuenta_corriente";
export type RolUsuario = "owner" | "admin" | "cajero";

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
  precio_venta: number;
  stock: number;
  stock_minimo: number;
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

export type ProductoUI = Producto & { categoria: string | null; emoji: string };

export interface MovimientoCajaRow {
  id: string;
  tipo: "ingreso_venta" | "ingreso_cobro_deuda" | "ingreso_manual" | "egreso_proveedor" | "egreso_manual";
  metodo_pago: MetodoPago;
  monto: number;
  descripcion: string | null;
  created_at: string;
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
