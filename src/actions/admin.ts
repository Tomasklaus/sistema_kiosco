"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import type { EstadoSuscripcion } from "@/actions/configuracion";

export interface AdminResumen {
  negocios: number;
  usuarios: number;
  nuevos_7d: number;
  activos_7d: number;
  ventas_total: number;
  monto_total: number;
  ventas_30d: number;
  monto_30d: number;
}

export interface AdminTenant {
  id: string;
  nombre: string;
  created_at: string;
  owner_email?: string | null;
  usuarios: number;
  productos: number;
  ventas: number;
  monto: number;
  ultima_venta: string | null;
  suscripcion_estado?: EstadoSuscripcion;
  suscripcion_plan?: string;
  suscripcion_proveedor?: string;
  suscripcion_fecha_fin?: string | null;
  dias_restantes?: number;
}

export interface AdminDia {
  dia: string;
  ventas: number;
  monto: number;
  nuevos_negocios: number;
}

export async function esPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

export async function obtenerPanelAdmin() {
  const supabase = await createClient();
  const [resumen, tenants, actividad] = await Promise.all([
    supabase.rpc("admin_resumen"),
    supabase.rpc("admin_tenants"),
    supabase.rpc("admin_actividad_diaria", { p_dias: 30 }),
  ]);
  if (resumen.error) return null;
  return {
    resumen: resumen.data as AdminResumen,
    tenants: (tenants.data ?? []) as AdminTenant[],
    actividad: (actividad.data ?? []) as AdminDia[],
  };
}

/**
 * Suma (o resta si es negativo) días al período de prueba o suscripción de un negocio.
 * Requiere ser SuperAdmin (`is_platform_admin()`).
 */
export async function adminAgregarDiasSuscripcion(
  tenantId: string,
  dias: number,
): Promise<ActionResult<{ estado: string; fecha_fin: string }>> {
  if (!tenantId || !Number.isFinite(dias) || dias === 0) {
    return { ok: false, error: "Indicá una cantidad de días válida distinta de cero" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_agregar_dias_suscripcion", {
    p_tenant_id: tenantId,
    p_dias: Math.trunc(dias),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true, data: data as { estado: string; fecha_fin: string } };
}

/**
 * Cambia el estado de la suscripción de un negocio (`activa`, `pausada`, `prueba`, `cancelada`).
 * Requiere ser SuperAdmin (`is_platform_admin()`).
 */
export async function adminCambiarEstadoSuscripcion(
  tenantId: string,
  estado: "prueba" | "activa" | "pausada" | "inactiva" | "cancelada",
  plan?: string,
): Promise<ActionResult<{ estado: string; plan: string; fecha_fin: string }>> {
  if (!tenantId) return { ok: false, error: "Negocio inválido" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_cambiar_estado_suscripcion", {
    p_tenant_id: tenantId,
    p_estado: estado,
    p_plan: plan ?? null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true, data: data as { estado: string; plan: string; fecha_fin: string } };
}
