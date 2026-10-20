"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, MetodoPago } from "@/types";

/**
 * Registra una venta. `cantidad` es SIEMPRE el número de unidades compradas:
 * se valida acá (entero >= 1) y la función `registrar_venta` vuelve a validar
 * del lado de la base, que es lo único que descuenta stock
 * (`stock = stock - cantidad`).
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

  const limpios = items
    .map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) }))
    .filter((i) => i.producto_id && Number.isFinite(i.cantidad) && i.cantidad >= 1);

  if (limpios.length !== items.length) {
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

