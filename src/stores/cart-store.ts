import { create } from "zustand";
import type { CartItem, Producto, ProductoUI, UnidadVenta } from "@/types";
import { cantidadSegura, normalizarCantidadVenta, redondearPeso, totalCarrito } from "@/lib/pesables";

/** Ítem del ticket con el producto ya resuelto para la UI (emoji, categoría). */
export type CartItemUI = Omit<CartItem, "producto"> & { producto: ProductoUI };

/** Tipo de venta del producto, tolerante a registros previos a la migración 0010. */
const unidadDe = (p: Pick<Producto, "unidad_venta">): UnidadVenta => (p.unidad_venta === "kg" ? "kg" : "unit");

/**
 * Cantidad segura para el carrito según el tipo de venta.
 *  - producto por unidad: entero >= 1 (comportamiento de siempre);
 *  - producto por kg: hasta 3 decimales (gramos), mínimo 0.001.
 * Así nunca llega a `registrarVenta` un precio, un total, un negativo o un NaN
 * (que en la base terminan descontando stock de más).
 */
export const normalizarCantidad = (cantidad: number | null | undefined, unidad: UnidadVenta = "unit"): number =>
  cantidadSegura(unidad, cantidad);

/** Cantidad del ítem tal como está en el carrito (redondeada según su tipo). */
export const cantidadItem = (item: CartItem): number => cantidadSegura(unidadDe(item.producto), item.cantidad);

interface CartState {
  items: CartItem[];
  add: (p: Producto, cantidad?: number) => void;
  /** Reemplaza la cantidad de un ítem. `0` (o menos) lo saca del ticket. */
  setCantidad: (productoId: string, cantidad: number) => void;
  remove: (productoId: string) => void;
  clear: () => void;
  total: () => number;
}

/**
 * Ítems del ticket tipados como `ProductoUI`: los productos que entran al
 * carrito salen siempre de `listarProductos()` (POS), así que ya tienen emoji y
 * categoría resueltos.
 */
export const useCartItems = (): CartItemUI[] =>
  useCartStore((s) => s.items) as unknown as CartItemUI[];

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  add: (p, cantidad = 1) =>
    set((s) => {
      const unidad = unidadDe(p);
      const cant = cantidadSegura(unidad, cantidad);
      const existing = s.items.find((i) => i.producto.id === p.id);
      if (existing) {
        const suma = existing.cantidad + cant;
        return {
          items: s.items.map((i) =>
            i.producto.id === p.id
              ? {
                  // Los pesables se acumulan por peso (0.250 + 0.350 = 0.600 kg);
                  // las unidades se suman enteras.
                  producto: p,
                  cantidad: unidad === "kg" ? redondearPeso(suma) : Math.round(suma),
                }
              : i
          ),
        };
      }
      return { items: [...s.items, { producto: p, cantidad: cant }] };
    }),
  setCantidad: (id, cantidad) =>
    set((s) => ({
      items: s.items.flatMap((i) => {
        if (i.producto.id !== id) return [i];
        // Bajar a 0 o menos quita el producto del ticket; si la cantidad no es
        // válida para su tipo de venta se deja la anterior (nunca se rompe).
        if (!Number.isFinite(Number(cantidad)) || Number(cantidad) <= 0) return [];
        const cant = normalizarCantidadVenta(unidadDe(i.producto), Number(cantidad));
        return [{ ...i, cantidad: cant ?? cantidadItem(i) }];
      }),
    })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.producto.id !== id) })),
  clear: () => set({ items: [] }),
  total: () => totalCarrito(get().items.map((i) => ({ producto: i.producto, cantidad: cantidadItem(i) }))),
}));
