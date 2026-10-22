import type { Producto, UnidadVenta } from "@/types";
import { formatARS, formatCantidad, formatCantidadVenta, gramosAKg } from "@/lib/utils";

/**
 * Lógica de los productos pesables (venta por kilo/gramos).
 *
 * Todo se guarda en la base en KILOS con hasta 3 decimales (`numeric(12,3)`):
 * 250 g → 0.250 kg. Así el precio por kg se aplica directo y el stock se
 * descuenta exactamente igual que una unidad.
 *
 * Las reglas de cantidad siguen el mismo criterio que `registrar_venta`
 * (migración 0010), así la UI nunca manda algo que la base vaya a rechazar:
 *  - producto por unidad → entero >= 1
 *  - producto por kg     → hasta 3 decimales, > 0 (mínimo 1 g)
 */

/** Unidad de carga del modal de peso. */
export type UnidadCarga = "kg" | "gr";

/** Mínimo vendible: 1 gramo (0.001 kg). */
export const KG_MINIMO = 0.001;

/** Cantidad inicial al abrir el modal de peso (250 g). */
export const KG_INICIAL = 0.25;

/** Atajos rápidos del modal, en kg. */
export const PRESETS_KG: { label: string; kg: number }[] = [
  { label: "100 g", kg: 0.1 },
  { label: "250 g", kg: 0.25 },
  { label: "500 g", kg: 0.5 },
  { label: "1 kg", kg: 1 },
];

/** Redondea un peso a gramos (3 decimales) evitando colas binarias. */
export function redondearPeso(kg: number): number {
  const n = Number.isFinite(kg) ? kg : 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * Valida y normaliza una cantidad de carrito según el tipo de venta.
 * Devuelve `null` si la cantidad no sirve (0, negativo, NaN, decimal en un
 * producto por unidad), para que quien llama decida qué hacer.
 */
export function normalizarCantidadVenta(unidad: UnidadVenta, cantidad: number): number | null {
  const n = Number(cantidad);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unidad === "kg") {
    const kg = redondearPeso(n);
    return kg >= KG_MINIMO ? kg : null;
  }
  // Por unidad: sólo enteros (1,5 u. no existe, como valida la base).
  const entero = redondearPeso(n);
  return Number.isInteger(entero) && entero >= 1 ? entero : null;
}

/**
 * Cantidad a agregar al carrito. Si el número es inválido cae en un valor
 * razonable (1 u. / 0,25 kg) en lugar de dejar el ticket roto; si es un decimal
 * de unidad sin intención (3,0001 por una suma) se redondea a entero.
 */
export function cantidadSegura(unidad: UnidadVenta, cantidad: number | null | undefined): number {
  const n = Number(cantidad ?? NaN);
  const valida = normalizarCantidadVenta(unidad, unidad === "kg" ? n : Math.round(n));
  if (valida !== null) return valida;
  return unidad === "kg" ? KG_INICIAL : 1;
}

/** Peso total de una cantidad cargada en kg o gramos, devuelto en kg. */
export function cantidadAKg(valor: number, unidad: UnidadCarga): number {
  return redondearPeso(unidad === "gr" ? gramosAKg(valor) : valor);
}

/**
 * Subtotal de una línea: `precio_kg × kg` (o `precio × unidades`), redondeado a
 * centavos como hace la base (`round(..., 2)`).
 */
export function subtotalLinea(precio: number, cantidad: number): number {
  const p = Number.isFinite(precio) ? precio : 0;
  const c = Number.isFinite(cantidad) ? cantidad : 0;
  return Math.round(p * c * 100) / 100;
}

/** Total del carrito ya redondeado a centavos. */
export function totalCarrito(items: { producto: Pick<Producto, "precio_venta">; cantidad: number }[]): number {
  return Math.round(items.reduce((acc, i) => acc + subtotalLinea(i.producto.precio_venta, i.cantidad), 0) * 100) / 100;
}

/**
 * Texto con la cantidad y el precio de una línea del ticket:
 *   pesable → "0,350 kg @ $6.000,00/kg"
 *   unidad  → "$450,00 c/u"
 */
export function textoDetalleLinea(p: Pick<Producto, "unidad_venta" | "precio_venta">, cantidad: number): string {
  return p.unidad_venta === "kg"
    ? `${formatCantidad(cantidad)} kg @ ${formatARS(p.precio_venta)}/kg`
    : `${formatARS(p.precio_venta)} c/u`;
}

/** Stock disponible con sufijo (`"12,5 kg"` / `"45 u."`). */
export function textoStock(stock: number, unidad: UnidadVenta): string {
  const n = Number.isFinite(stock) ? stock : 0;
  return unidad === "kg" ? `${formatCantidad(n)} kg` : `${formatCantidad(n)} u.`;
}

/** Cantidad de carrito con sufijo, para el input/etiqueta del ticket. */
export function textoCantidad(cantidad: number, unidad: UnidadVenta): string {
  return formatCantidadVenta(cantidad, unidad);
}
