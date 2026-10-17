import type { Producto, ProductoUI } from "@/types";

/**
 * Emoji sugerido por categoría: se usa cuando el producto no tiene uno propio.
 * También alimenta las sugerencias del selector de emoji en inventario.
 */
export const EMOJI_POR_CATEGORIA: Record<string, string> = {
  Golosinas: "🍬",
  Bebidas: "🥤",
  Snacks: "🍟",
  Cigarrillos: "🚬",
};

/** Emoji por defecto cuando el producto no tiene emoji ni categoría conocida. */
export const EMOJI_FALLBACK = "📦";

/** Catálogo de íconos típicos de kiosco para el selector rápido. */
export const EMOJIS_SUGERIDOS: string[] = [
  // Golosinas y snacks
  "🍬", "🍭", "🍫", "🍪", "🍩", "🍿", "🍟", "🥜", "🌰", "🧁", "🍰",
  // Bebidas
  "🥤", "☕", "🧃", "🧋", "🍺", "🍷", "🧊", "💧", "🥛", "🍹", "🍶", "🧉",
  // Kiosco / almacén
  "🚬", "🔥", "🥖", "🍞", "🧀", "🥫", "🍚", "🧂", "🍯", "🥚", "🥓",
  // Limpieza y cuidado personal
  "🧻", "🧼", "🧴", "🪥", "🧽", "🪒",
  // Tecnología y varios
  "🔋", "📱", "🔌", "🎧", "💡", "🎮", "📰", "🎫", "💊", "🩹", "🧸", "🎁",
];

/** Normaliza el emoji que llega de la UI: vacío o sólo espacios → `null`. */
export function normalizarEmoji(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim();
  // Los emojis compuestos (familias, banderas) ocupan más de un code point.
  return limpio ? Array.from(limpio).slice(0, 2).join("") : null;
}

/** Normaliza el nombre: recorta espacios y devuelve `null` si queda vacío. */
export function normalizarNombreProducto(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").trim();
  return limpio ? limpio.slice(0, 120) : null;
}

/** Redondea a centavos evitando los decimales flotantes (12.3456 → 12.35). */
export function redondearDinero(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
}

/** Redondea cantidades de stock a 3 decimales (como la columna numeric(12,3)). */
export function redondearStock(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 1000) / 1000;
}

/** Validaciones alineadas con los `check` de la tabla productos. */
export function validarProducto(p: { nombre: string | null; precio_costo: number; precio_venta: number }): string | null {
  if (!p.nombre) return "El nombre del producto es obligatorio";
  if (!Number.isFinite(p.precio_costo) || p.precio_costo < 0) return "El costo no puede ser negativo";
  if (!Number.isFinite(p.precio_venta) || p.precio_venta < 0) return "El precio de venta no puede ser negativo";
  return null;
}

export function toUI(row: Producto & { categorias?: { nombre: string } | null }): ProductoUI {
  const { categorias, ...p } = row;
  const categoria = categorias?.nombre ?? null;
  const propio = normalizarEmoji(p.emoji);
  const porCategoria = categoria ? EMOJI_POR_CATEGORIA[categoria] : undefined;
  return { ...p, categoria, emoji: propio ?? porCategoria ?? EMOJI_FALLBACK };
}
