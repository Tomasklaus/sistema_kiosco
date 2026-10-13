"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, CajaData } from "@/types";

export async function obtenerCaja(): Promise<CajaData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Cada persona del negocio tiene su propio turno: solo se ve el que abrió el usuario actual.
  const { data: turno } = await supabase
    .from("turnos_caja").select("*").eq("estado", "abierto").eq("usuario_apertura", user.id).maybeSingle();
  if (!turno) return null;
  const { data: movimientos } = await supabase
    .from("movimientos_caja").select("id, tipo, metodo_pago, monto, descripcion, created_at")
    .eq("turno_id", turno.id).order("created_at", { ascending: true });
  return { turno, movimientos: movimientos ?? [] };
}

export async function abrirTurno(montoInicial: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_turno", { p_monto_inicial: montoInicial });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function registrarEgreso(monto: number, concepto: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_egreso", { p_monto: monto, p_concepto: concepto });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cerrarTurno(efectivoContado: number): Promise<ActionResult<{ esperado: number; contado: number; diferencia: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cerrar_turno", { p_efectivo_contado: efectivoContado });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data };
}
