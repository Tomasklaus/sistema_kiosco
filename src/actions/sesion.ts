"use server";

import { createClient } from "@/lib/supabase/server";
import type { RolUsuario } from "@/types";

export interface Sesion {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolUsuario;
  negocio: string;
}

export interface AlertaStock {
  id: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
}

/** Devuelve null si no hay usuario o si su cuenta no tiene acceso a ningún negocio (p. ej. desactivada). */
export async function obtenerSesion(): Promise<Sesion | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles").select("nombre, rol, tenants(nombre)").eq("id", user.id).maybeSingle();
  if (!data) return null;
  const tenant = data.tenants as unknown as { nombre: string } | null;
  return {
    id: user.id,
    email: user.email ?? "",
    nombre: data.nombre,
    rol: data.rol as RolUsuario,
    negocio: tenant?.nombre ?? "Mi negocio",
  };
}

export async function alertasStock(): Promise<AlertaStock[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos_stock_bajo").select("id, nombre, stock, stock_minimo")
    .order("stock", { ascending: true }).limit(30);
  return (data ?? []) as AlertaStock[];
}
