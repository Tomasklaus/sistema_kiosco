"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeEditarMiembros, puedeInvitarAdmin, esGestionEquipo } from "@/lib/permisos";
import type { ActionResult, RolUsuario } from "@/types";
import { obtenerSesion } from "@/actions/sesion";

export interface Miembro {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
}

export interface Invitacion {
  id: string;
  codigo: string;
  rol: "admin" | "cajero";
  expira_at: string;
}

export async function listarEquipo() {
  const supabase = await createClient();
  const [m, i] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, nombre, email, rol, activo, created_at")
      .order("created_at"),
    supabase
      .from("invitaciones")
      .select("id, codigo, rol, expira_at")
      .is("usado_por", null)
      .gt("expira_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return {
    // Si falla alguna consulta es porque falta ejecutar la migración 0004+.
    migrado: !m.error && !i.error,
    miembros: (m.data ?? []) as Miembro[],
    invitaciones: (i.data ?? []) as Invitacion[],
  };
}

export async function crearInvitacion(rol: "admin" | "cajero"): Promise<ActionResult<string>> {
  const sesion = await obtenerSesion();
  if (!sesion?.activo || !esGestionEquipo(sesion.rol)) {
    return { ok: false, error: "No autorizado" };
  }
  if (rol === "admin" && !puedeInvitarAdmin(sesion.rol)) {
    return { ok: false, error: "Solo el dueño puede invitar administradores" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_invitacion", { p_rol: rol });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/equipo");
  return { ok: true, data: data as string };
}

export async function revocarInvitacion(id: string): Promise<ActionResult> {
  const sesion = await obtenerSesion();
  if (!sesion?.activo || !esGestionEquipo(sesion.rol)) {
    return { ok: false, error: "No autorizado" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("invitaciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/equipo");
  return { ok: true };
}

export async function actualizarMiembro(
  userId: string,
  rol: "admin" | "cajero",
  activo: boolean
): Promise<ActionResult> {
  const sesion = await obtenerSesion();
  if (!sesion?.activo || !puedeEditarMiembros(sesion.rol)) {
    return { ok: false, error: "Solo el dueño puede modificar miembros del equipo" };
  }
  if (userId === sesion.id) {
    return { ok: false, error: "No podés modificarte a vos mismo" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_miembro", {
    p_user: userId,
    p_rol: rol,
    p_activo: activo,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/equipo");
  return { ok: true };
}
