import type { ItemMovimiento, TipoMovCaja } from "@/types";

/** Formatos de fecha/hora del negocio (Argentina, sin horario de verano). */
export const TZ_AR = "America/Argentina/Buenos_Aires";

export const fechaHoraAR = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: TZ_AR, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const soloHoraAR = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { timeZone: TZ_AR, hour: "2-digit", minute: "2-digit" });

/** Clave YYYY-MM-DD de un instante en la zona del negocio. */
export const diaAR = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ_AR, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Etiqueta del día: "Hoy", "Ayer" o "Lunes 14/10/2026". */
export function etiquetaDia(iso: string): string {
  const hoy = diaAR(new Date().toISOString());
  const ayer = diaAR(new Date(Date.now() - 86400_000).toISOString());
  const d = diaAR(iso);
  if (d === hoy) return "Hoy";
  if (d === ayer) return "Ayer";
  const txt = new Intl.DateTimeFormat("es-AR", { timeZone: TZ_AR, weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Nombre legible de cada tipo de movimiento. */
export const ETIQUETA_MOV: Record<TipoMovCaja, string> = {
  ingreso_venta: "Venta cobrada",
  ingreso_cobro_deuda: "Cobro de cuenta corriente",
  ingreso_manual: "Ingreso manual",
  egreso_proveedor: "Egreso (gasto / pago)",
  egreso_manual: "Egreso manual",
  egreso_anulacion: "Anulación de venta",
  nota_stock: "Ajuste de stock",
};

export const esIngresoCaja = (tipo: TipoMovCaja) => tipo.startsWith("ingreso");

/** Motivos de stock, con su etiqueta y si cuentan como ingreso de mercadería. */
export const MOTIVOS_STOCK = [
  { id: "compra_proveedor", label: "Compra a proveedor", ingreso: true },
  { id: "reposicion", label: "Reposición de stock", ingreso: true },
  { id: "devolucion_cliente", label: "Devolución de un cliente", ingreso: true },
  { id: "carga_inicial", label: "Carga inicial", ingreso: true },
  { id: "ajuste_inventario", label: "Ajuste por inventario", ingreso: false },
  { id: "merma_rotura", label: "Merma / rotura / vencido", ingreso: false },
  { id: "consumo_interno", label: "Uso interno del negocio", ingreso: false },
  { id: "error_carga", label: "Corrección de un error de carga", ingreso: false },
] as const;

export type MotivoStock = (typeof MOTIVOS_STOCK)[number]["id"];

export function etiquetaMotivo(motivo: string): string {
  return MOTIVOS_STOCK.find((m) => m.id === motivo)?.label ?? motivo;
}

/** Formas de pago que puede usar un egreso (más amplias que el enum de ventas). */
export const FORMAS_PAGO_EGRESO = [
  { id: "efectivo", label: "Efectivo (sale de la caja)" },
  { id: "transferencia", label: "Transferencia" },
  { id: "mercadopago", label: "Mercado Pago" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "cuenta_corriente", label: "Cuenta corriente (queda a deber)" },
] as const;

/** Total de unidades que entraron (positivas) en una lista de ítems. */
export const unidadesEntrada = (items: ItemMovimiento[] | null | undefined) =>
  (items ?? []).reduce((a, i) => a + (Number(i.cantidad) > 0 ? Number(i.cantidad) : 0), 0);

/** Total de unidades que salieron (negativas) en una lista de ítems. */
export const unidadesSalida = (items: ItemMovimiento[] | null | undefined) =>
  (items ?? []).reduce((a, i) => a + (Number(i.cantidad) < 0 ? -Number(i.cantidad) : 0), 0);

/** `producto:<uuid>` → uuid (o null). */
export function productoDeReferencia(ref: string | null | undefined): string | null {
  if (!ref?.startsWith("producto:")) return null;
  const id = ref.slice("producto:".length).split(":")[0];
  return id || null;
}
