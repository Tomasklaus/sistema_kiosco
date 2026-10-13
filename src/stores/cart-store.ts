import { create } from "zustand";
import type { Producto } from "@/types";

export interface CartItem {
  producto: Producto;
  cantidad: number;
}

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
      const existing = s.items.find((i) => i.producto.id === p.id);
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.producto.id === p.id ? { ...i, cantidad: i.cantidad + cantidad } : i
          ),
        };
      }
      return { items: [...s.items, { producto: p, cantidad }] };
    }),
  setCantidad: (id, cantidad) =>
    set((s) => ({
      items: s.items
        .map((i) => (i.producto.id === id ? { ...i, cantidad } : i))
        .filter((i) => i.cantidad > 0),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.producto.id !== id) })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((acc, i) => acc + i.producto.precio_venta * i.cantidad, 0),
}));
