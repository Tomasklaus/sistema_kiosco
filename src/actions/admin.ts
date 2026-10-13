"use server";

import { createClient } from "@/lib/supabase/server";

export interface AdminResumen {
  negocios: number; usuarios: number; nuevos_7d: number; activos_7d: number;
  ventas_total: number; monto_total: number; ventas_30d: number; monto_30d: number;
}
export interface AdminTenant {
  id: string; nombre: string; created_at: string; usuarios: number; productos: number;
  ventas: number; monto: number; ultima_venta: string | null;
}
export interface AdminDia { dia: string; ventas: number; monto: number; nuevos_negocios: number }

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
