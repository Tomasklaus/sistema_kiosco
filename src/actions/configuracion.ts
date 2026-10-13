"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

export interface NegocioConfig {
  id: string;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  cuit?: string | null;
  mensaje_ticket?: string | null;
}

export interface SuscripcionInfo {
  id?: string;
  estado: "activa" | "inactiva" | "pendiente" | "cancelada";
  proveedor?: "mercadopago" | "paypal" | "manual" | null;
  proveedor_suscripcion_id?: string | null;
  plan: string;
  precio: number;
  moneda: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
}

export interface MetodosPagoNegocio {
  efectivo: boolean;
  mercadopago: boolean;
  tarjeta: boolean;
  cuenta_corriente: boolean;
}

export async function obtenerConfiguracion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Obtenemos el perfil y el tenant
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, rol, tenant_id, tenants(*)")
    .eq("id", user.id)
    .maybeSingle();

  const tenant = profile?.tenants as unknown as NegocioConfig | null;

  // Obtenemos la suscripción del usuario/negocio
  const { data: sub } = await supabase
    .from("suscripciones")
    .select("*")
    .eq("usuario_id", user.id)
    .maybeSingle();

  const suscripcion: SuscripcionInfo = sub ? {
    id: sub.id,
    estado: sub.estado,
    proveedor: sub.proveedor,
    proveedor_suscripcion_id: sub.proveedor_suscripcion_id,
    plan: sub.plan,
    precio: Number(sub.precio) || 15000,
    moneda: sub.moneda || "ARS",
    fecha_inicio: sub.fecha_inicio,
    fecha_fin: sub.fecha_fin,
  } : {
    estado: "inactiva",
    plan: "Plan Pro Mensual",
    precio: 15000,
    moneda: "ARS",
  };

  return {
    negocio: tenant ?? { id: profile?.tenant_id ?? "", nombre: "Mi Kiosco" },
    suscripcion,
    usuario: { id: user.id, email: user.email ?? "", rol: profile?.rol ?? "cajero" },
  };
}

export async function actualizarDatosNegocio(input: {
  nombre: string;
  direccion?: string;
  telefono?: string;
  mensaje_ticket?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, rol")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) return { ok: false, error: "Negocio no encontrado" };
  if (profile.rol === "cajero") return { ok: false, error: "Solo los administradores pueden editar datos del negocio" };

  const { error } = await supabase
    .from("tenants")
    .update({
      nombre: input.nombre.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.tenant_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}
