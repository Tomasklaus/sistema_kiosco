import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatARS = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);

/**
 * Lee un número escrito a mano (formato es-AR) sin redondearlo de más.
 *
 * - `"1.000"` → 1000 (punto como separador de miles), `"1,5"` → 1.5.
 * - `"2000"` → 2000; `""`, `"-"`, `"abc"` → null.
 *
 * Se usa en cantidades de stock y en montos de caja para que "2.000" nunca se
 * lea como 2 ni como 0, y para no aceptar valores negativos.
 */
export function parseNumero(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto = (valor ?? "").replace(/\s/g, "");
  if (!texto) return null;

  if (texto.includes(",")) {
    // Decimales con coma: el punto (si queda) es separador de miles.
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\.|$)/.test(texto) || /^\d{1,3}(\.\d{3})+$/.test(texto)) {
    // "1.000" / "1.000.000": separadores de miles sin decimales.
    texto = texto.replace(/\./g, "");
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** Igual que `parseNumero` pero nunca negativo y con `0` como valor por defecto. */
export function parseNumeroPositivo(valor: string | number | null | undefined): number {
  const n = parseNumero(valor);
  return n === null ? 0 : Math.max(0, n);
}

/** Muestra 2000 con separador de miles (es-AR) en un input de stock. */
export const formatCantidad = (n: number) =>
  Number.isFinite(n) ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n) : "";

/**
 * Peso en kg con hasta 3 decimales y sufijo "kg" (es-AR): `0.35` → "0,35 kg".
 * Se usa en el POS, el ticket y el inventario de productos pesables.
 */
export const formatKg = (kg: number) =>
  Number.isFinite(kg) ? `${formatCantidad(kg)} kg` : "—";

/**
 * Cantidad lista para mostrar según el tipo de venta: `"3 u."` o `"0,35 kg"`.
 */
export const formatCantidadVenta = (cantidad: number, unidad: "unit" | "kg") =>
  unidad === "kg" ? formatKg(cantidad) : `${formatCantidad(cantidad)} u.`;

/**
 * Convierte gramos a kilos con 3 decimales (250 → 0.25) evitando las colas
 * binarias (0.1 + 0.2 ≠ 0.30000000000000004).
 */
export const gramosAKg = (gramos: number) =>
  Math.round((Number.isFinite(gramos) ? gramos : 0)) / 1000;

