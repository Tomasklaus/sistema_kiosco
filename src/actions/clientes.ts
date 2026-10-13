"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ClienteConMovs, MetodoPago } from "@/types";

export async function listarClientes(): Promise<ClienteConMovs[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, movimientos_cuenta(id, tipo, monto, notas, created_at)")
    .eq("activo", true).order("nombre");
  return (data ?? []) as ClienteConMovs[];
}

export async function crearCliente(nombre: string, telefono: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert({ nombre, telefono: telefono || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function registrarMovCuenta(
  clienteId: string, tipo: "cargo" | "pago", monto: number, notas: string, metodo: MetodoPago = "efectivo"
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_mov_cuenta", {
    p_cliente: clienteId, p_tipo: tipo, p_monto: monto, p_notas: notas || null, p_metodo: metodo,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
