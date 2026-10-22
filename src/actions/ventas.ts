"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, MetodoPago } from "@/types";

/**
 * Registra una venta. `cantidad` es el número de unidades (entero >= 1) o los
 * kilos con hasta 3 decimales si el producto es pesable (`unidad_venta = 'kg'`).
 *
 * Acá sólo se descarta lo obviamente inválido (NaN, 0 o negativo); la
 * validación definitiva —enteros para productos por unidad, hasta gramos para
 * los pesables— y el descuento de stock los hace `registrar_venta` en la base
 * (migración 0010), que es la única fuente de verdad.
 */
export async function registrarVenta(
  items: { producto_id: string; cantidad: number }[],
  metodo: MetodoPago,
  montoRecibido?: number,
  clienteId?: string
): Promise<ActionResult<string>> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "La venta no tiene items" };
  }

  const limpios = items.map((i) => ({
    producto_id: i.producto_id,
    // 3 decimales = gramos; se corta la cola binaria (0.1 + 0.2 → 0.3).
    cantidad: Math.round(Number(i.cantidad) * 1000) / 1000,
  }));

  if (limpios.some((i) => !i.producto_id || !Number.isFinite(i.cantidad) || i.cantidad <= 0)) {
    return { ok: false, error: "Hay productos con una cantidad inválida" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_items: limpios,
    p_metodo: metodo,
    p_monto_recibido: montoRecibido ?? null,
    p_cliente_id: clienteId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

