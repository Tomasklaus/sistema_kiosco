import { create } from "zustand";
import type { Producto } from "@/types";

export interface CartItem {
  producto: Producto;
  cantidad: number;
}

/**
 * Cantidad segura para el carrito: positiva y con hasta 3 decimales.
 * Así nunca llega a `registrarVenta` un precio, un total, un negativo o un NaN
 * (que en la base terminan descontando stock de más).
 */
export const normalizarCantidad = (cantidad: number | null | undefined): number => {
  const n = Number(cantidad);
  if (!Number.isFinite(n)) return 1;
  // Se redondea a 3 decimales (gramos) para evitar colas binarias tipo 0.30000000000004.
  return Math.max(1, Math.round(n * 1000) / 1000);
};

interface CartState {
  items: CartItem[];
  add: (p: Producto, cantidad?: number) => void;
  setCantidad: (productoId: string, cantidad: number) => void;
  remove: (productoId: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  add: (p, cantidad = 1) =>
    set((s) => {
      const cant = normalizarCantidad(cantidad);
      const existing = s.items.find((i) => i.producto.id === p.id);
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.producto.id === p.id ? { ...i, cantidad: normalizarCantidad(i.cantidad + cant) } : i
          ),
        };
      }
      return { items: [...s.items, { producto: p, cantidad: cant }] };
    }),
  setCantidad: (id, cantidad) =>
    set((s) => ({
      items: s.items
        // Bajar a 0 o menos quita el producto del ticket.
        .map((i) => (i.producto.id === id ? { ...i, cantidad: normalizarCantidad(cantidad) } : i))
        .filter((i) => (i.producto.id === id ? Number(cantidad) >= 1 && Number.isFinite(Number(cantidad)) : true)),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.producto.id !== id) })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((acc, i) => acc + i.producto.precio_venta * normalizarCantidad(i.cantidad), 0),
}));

