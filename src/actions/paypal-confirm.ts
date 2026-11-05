"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerTokenPayPal } from "@/actions/configuracion";
import type { ActionResult } from "@/types";

/**
 * Confirma inmediatamente una suscripción de PayPal recién aprobada en el navegador
 * sin esperar a que el webhook asíncrono impacte.
 */
export async function confirmarSuscripcionPayPal(subscriptionId: string): Promise<ActionResult> {
  if (!subscriptionId) return { ok: false, error: "ID de suscripción no provisto" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) return { ok: false, error: "Negocio no encontrado" };

  const authPP = await obtenerTokenPayPal();
  if (!authPP || !authPP.token) return { ok: false, error: "Error de conexión con PayPal" };

  try {
    const res = await fetch(`${authPP.apiBase}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: {
        Authorization: `Bearer ${authPP.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return { ok: false, error: "No se pudo consultar el estado de la suscripción en PayPal" };
    }

    const data = await res.json();
    const status = String(data?.status || "").toUpperCase();

    if (status === "ACTIVE" || status === "APPROVED") {
      // 30 días a partir de hoy (o extendiendo la fecha actual)
      const ahora = Date.now();
      const nuevaFin = new Date(ahora + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: upsertErr } = await supabase.from("suscripciones").upsert(
        {
          tenant_id: profile.tenant_id,
          usuario_id: user.id,
          estado: "activa",
          proveedor: "paypal",
          proveedor_suscripcion_id: subscriptionId,
          plan: "Plan Pioneros Internacional (PayPal)",
          precio: 20.0,
          moneda: "USD",
          fecha_inicio: new Date().toISOString(),
          fecha_fin: nuevaFin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

      if (upsertErr) return { ok: false, error: upsertErr.message };

      revalidatePath("/configuracion");
      revalidatePath("/", "layout");
      return { ok: true };
    }

    return { ok: false, error: `Estado de la suscripción: ${status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al confirmar suscripción" };
  }
}
