"use server";

import { createClient } from "@/lib/supabase/server";
import { calcularEstadoSuscripcion, type EstadoSuscripcion } from "@/lib/suscripcion";
import type { RolUsuario } from "@/types";

export interface Sesion {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolUsuario;
  negocio: string;
  activo: boolean;
  suscripcion: {
    estado: EstadoSuscripcion;
    diasRestantes: number;
    operativa: boolean;
  };
}

export interface AlertaStock {
  id: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
}

/**
 * Devuelve null si no hay usuario autenticado o no existe perfil.
 * Si el perfil está desactivado, igual se devuelve la sesión con activo=false
 * para que el layout pueda bloquear el acceso.
 */
export async function obtenerSesion(): Promise<Sesion | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("nombre, rol, activo, tenant_id, tenants(nombre)")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;

  const tenant = data.tenants as unknown as { nombre: string } | null;
  const tenantId = (data.tenant_id as string | undefined) ?? "";

  let subRow: { estado?: string | null; fecha_fin?: string | null } | null = null;
  if (tenantId) {
    const { data: subTenant, error } = await supabase
      .from("suscripciones")
      .select("estado, fecha_fin")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!error && subTenant) subRow = subTenant;
  }
  if (!subRow) {
    const { data: subUser } = await supabase
      .from("suscripciones")
      .select("estado, fecha_fin")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (subUser) subRow = subUser;
  }

  const calc = calcularEstadoSuscripcion(subRow);

  return {
    id: user.id,
    email: user.email ?? "",
    nombre: data.nombre,
    rol: data.rol as RolUsuario,
    negocio: tenant?.nombre ?? "Mi negocio",
    activo: data.activo !== false,
    suscripcion: calc,
  };
}

export async function alertasStock(): Promise<AlertaStock[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos_stock_bajo").select("id, nombre, stock, stock_minimo")
    .order("stock", { ascending: true }).limit(30);
  return (data ?? []) as AlertaStock[];
}
