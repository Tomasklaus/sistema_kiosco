import type { Producto, ProductoUI } from "@/types";

const EMOJI: Record<string, string> = { Golosinas: "🍬", Bebidas: "🥤", Snacks: "🍟", Cigarrillos: "🚬" };

export function toUI(row: Producto & { categorias?: { nombre: string } | null }): ProductoUI {
  const { categorias, ...p } = row;
  const categoria = categorias?.nombre ?? null;
  return { ...p, categoria, emoji: (categoria && EMOJI[categoria]) || "📦" };
}
