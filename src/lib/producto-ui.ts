import type { Producto, ProductoUI, UnidadVenta } from "@/types";
import { formatCantidadVenta } from "@/lib/utils";

/**
 * Emoji sugerido por categoría: se usa cuando el producto no tiene uno propio.
 * También alimenta las sugerencias del selector de emoji en inventario.
 */
export const EMOJI_POR_CATEGORIA: Record<string, string> = {
  Golosinas: "🍬",
  Bebidas: "🥤",
  Snacks: "🍟",
  Cigarrillos: "🚬",
  Fiambrería: "🧀",
  Verdulería: "🥬",
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

/** Normaliza el nombre de una categoría: recorta espacios y devuelve `null` si queda vacío. */
export function normalizarNombreCategoria(valor: string | null | undefined): string | null {
  const limpio = (valor ?? "").replace(/\s+/g, " ").trim();
  return limpio ? limpio.slice(0, 40) : null;
}

/** Emoji sugerido al dar de alta una categoría nueva. */
export const EMOJI_CATEGORIA = "🏷️";

/** Redondea a centavos evitando los decimales flotantes (12.3456 → 12.35). */
export function redondearDinero(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 100) / 100;
}

/** Redondea cantidades de stock a 3 decimales (como la columna numeric(12,3)). */
export function redondearStock(valor: number): number {
  return Math.round((Number.isFinite(valor) ? valor : 0) * 1000) / 1000;
}

/** Kg (o unidades) con hasta 3 decimales; nunca negativo. */
export function redondearCantidad(valor: number): number {
  return Math.max(0, redondearStock(valor));
}

/** Etiqueta del tipo de venta para el formulario y la tabla de inventario. */
export const ETIQUETA_UNIDAD: Record<UnidadVenta, string> = {
  unit: "Por unidad",
  kg: "Por peso (Kg/Gramos)",
};

/** Etiqueta corta del tipo de venta (`u.` / `kg`). */
export const SIGLA_UNIDAD: Record<UnidadVenta, string> = { unit: "u.", kg: "kg" };

/** Normaliza el tipo de venta que llega de la UI o de la base. */
export function normalizarUnidadVenta(valor: string | null | undefined): UnidadVenta {
  return valor === "kg" ? "kg" : "unit";
}

/** ¿El producto se vende por peso (kg/gramos)? */
export function esPesable(p: Pick<Producto, "unidad_venta"> | null | undefined): boolean {
  return p?.unidad_venta === "kg";
}

/** Cantidad tal como se muestra en el ticket: `"0,35 kg"` o `"3 u."`. */
export function etiquetaCantidad(p: Pick<Producto, "unidad_venta">, cantidad: number): string {
  return formatCantidadVenta(cantidad, p.unidad_venta);
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
  // Si la migración 0010 todavía no está aplicada, la columna no viene: el
  // producto se trata como "por unidad", que es el comportamiento de siempre.
  return {
    ...p,
    unidad_venta: normalizarUnidadVenta(p.unidad_venta),
    categoria,
    emoji: propio ?? porCategoria ?? EMOJI_FALLBACK,
  };
}
