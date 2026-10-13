"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, MetodoPago } from "@/types";

export async function registrarVenta(
  items: { producto_id: string; cantidad: number }[],
  metodo: MetodoPago,
  montoRecibido?: number,
  clienteId?: string
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_venta", {
    p_items: items,
    p_metodo: metodo,
    p_monto_recibido: montoRecibido ?? null,
    p_cliente_id: clienteId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}
