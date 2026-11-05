import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function obtenerTokenPayPal(): Promise<{ token: string; apiBase: string } | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) return null;

  const isLive = process.env.PAYPAL_ENV === "live" || process.env.NODE_ENV === "production";
  const apiBase =
    process.env.PAYPAL_API_BASE ||
    (isLive ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.access_token) return null;
  return { token: json.access_token as string, apiBase };
}

/**
 * Verifica la autenticidad del evento webhook con la API de PayPal
 * cuando `PAYPAL_WEBHOOK_ID` está configurado en las variables de entorno.
 */
async function verificarFirmaPayPal(
  req: Request,
  rawEvent: Record<string, unknown>,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return true; // En desarrollo sin PAYPAL_WEBHOOK_ID no bloqueamos

  const authPP = await obtenerTokenPayPal();
  if (!authPP) return false;

  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionTime = req.headers.get("paypal-transmission-time");
  const certUrl = req.headers.get("paypal-cert-url");
  const authAlgo = req.headers.get("paypal-auth-algo");
  const transmissionSig = req.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  const verifyRes = await fetch(`${authPP.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authPP.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: rawEvent,
    }),
  });

  if (!verifyRes.ok) return false;
  const verifyData = await verifyRes.json();
  return verifyData?.verification_status === "SUCCESS";
}

function parseCustomId(raw: unknown): {
  esLlaveEnMano: boolean;
  tenantId: string | null;
  usuarioId: string | null;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return { esLlaveEnMano: false, tenantId: null, usuarioId: null };
  }
  const partes = raw.trim().split(":");
  if (partes[0] === "llave_en_mano") {
    return {
      esLlaveEnMano: true,
      tenantId: partes[1] ?? null,
      usuarioId: partes[2] ?? null,
    };
  }
  if (partes.length >= 2) {
    return {
      esLlaveEnMano: false,
      tenantId: partes[0] ?? null,
      usuarioId: partes[1] ?? null,
    };
  }
  return {
    esLlaveEnMano: false,
    tenantId: null,
    usuarioId: partes[0] ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventType = String(body.event_type || "");
    const resource = (body.resource || {}) as Record<string, unknown>;

    const firmaOk = await verificarFirmaPayPal(req, body);
    if (!firmaOk) {
      return NextResponse.json({ error: "Firma de webhook PayPal inválida" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ received: true, skipped: "missing_supabase_service_role" });
    }

    // 1. Suscripción activada o renovada
    if (
      eventType === "BILLING.SUBSCRIPTION.ACTIVATED" ||
      eventType === "BILLING.SUBSCRIPTION.UPDATED" ||
      eventType === "BILLING.SUBSCRIPTION.RE-ACTIVATED"
    ) {
      const subscriptionId = String(resource.id || "");
      const { tenantId, usuarioId } = parseCustomId(resource.custom_id);
      const nuevaFin = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let finalTenantId = tenantId;
      const finalUserId = usuarioId;
      if (!finalTenantId && finalUserId) {
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("tenant_id")
          .eq("id", finalUserId)
          .maybeSingle();
        finalTenantId = (prof?.tenant_id as string | undefined) ?? null;
      }

      if (finalTenantId && finalUserId) {
        await supabaseAdmin.from("suscripciones").upsert(
          {
            tenant_id: finalTenantId,
            usuario_id: finalUserId,
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
      } else if (finalUserId) {
        await supabaseAdmin
          .from("suscripciones")
          .update({
            estado: "activa",
            proveedor: "paypal",
            proveedor_suscripcion_id: subscriptionId,
            plan: "Plan Pioneros Internacional (PayPal)",
            precio: 20.0,
            moneda: "USD",
            fecha_fin: nuevaFin,
            updated_at: new Date().toISOString(),
          })
          .eq("usuario_id", finalUserId);
      }
    }

    // 2. Suscripción suspendida o cancelada
    if (
      eventType === "BILLING.SUBSCRIPTION.CANCELLED" ||
      eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ||
      eventType === "BILLING.SUBSCRIPTION.EXPIRED"
    ) {
      const subscriptionId = String(resource.id || "");
      const nuevoEstado =
        eventType === "BILLING.SUBSCRIPTION.SUSPENDED" ? "pausada" : "cancelada";
      if (subscriptionId) {
        await supabaseAdmin
          .from("suscripciones")
          .update({
            estado: nuevoEstado,
            updated_at: new Date().toISOString(),
          })
          .eq("proveedor_suscripcion_id", subscriptionId);
      }
    }

    // 3. Cobro de cuota o de Orden única (Plan Pioneros USD o Servicio Llave en Mano)
    if (
      eventType === "PAYMENT.SALE.COMPLETED" ||
      eventType === "CHECKOUT.ORDER.APPROVED" ||
      eventType === "PAYMENT.CAPTURE.COMPLETED"
    ) {
      const purchaseUnits = Array.isArray(resource.purchase_units)
        ? (resource.purchase_units as Record<string, unknown>[])
        : [];
      const customRaw =
        resource.custom_id ||
        resource.custom ||
        purchaseUnits[0]?.custom_id ||
        "";

      const { esLlaveEnMano, tenantId, usuarioId } = parseCustomId(customRaw);
      const billingAgreementId = resource.billing_agreement_id
        ? String(resource.billing_agreement_id)
        : null;

      const amountObj = (resource.amount || purchaseUnits[0]?.amount || {}) as Record<string, unknown>;
      const monto = Number(amountObj.total || amountObj.value || 20);
      const moneda = String(amountObj.currency || amountObj.currency_code || "USD");

      let subQuery = supabaseAdmin.from("suscripciones").select("id, fecha_fin");
      if (tenantId) {
        subQuery = subQuery.eq("tenant_id", tenantId);
      } else if (usuarioId) {
        subQuery = subQuery.eq("usuario_id", usuarioId);
      } else if (billingAgreementId) {
        subQuery = subQuery.eq("proveedor_suscripcion_id", billingAgreementId);
      } else {
        return NextResponse.json({ received: true });
      }

      const { data: sub } = await subQuery.maybeSingle();
      if (sub?.id) {
        if (!esLlaveEnMano) {
          const baseMs = sub.fecha_fin ? Math.max(Date.now(), new Date(sub.fecha_fin).getTime()) : Date.now();
          const nuevaFin = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin
            .from("suscripciones")
            .update({
              estado: "activa",
              proveedor: "paypal",
              moneda: "USD",
              precio: 20.0,
              fecha_fin: nuevaFin,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sub.id);
        }

        await supabaseAdmin.from("historial_pagos_suscripcion").upsert(
          {
            suscripcion_id: sub.id,
            proveedor_pago_id: `pp_${String(resource.id || Date.now())}`,
            monto,
            moneda,
            estado: esLlaveEnMano ? "llave_en_mano_aprobado" : "aprobado",
            fecha_pago: new Date().toISOString(),
          },
          { onConflict: "proveedor_pago_id" },
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook de PayPal:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
