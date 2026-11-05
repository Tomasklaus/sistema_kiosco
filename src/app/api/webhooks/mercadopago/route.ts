import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Valida la firma HMAC-SHA256 `x-signature` de Mercado Pago cuando
 * `MP_WEBHOOK_SECRET` está configurado en el servidor.
 */
function verificarFirmaMP(req: Request, dataId: string | undefined): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // Si no configuraron secret aún, no bloqueamos en modo desarrollo

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !dataId) return false;

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [k, v] = part.trim().split("=");
      return [k, v];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(v1, "hex"));
  } catch {
    return false;
  }
}

/**
 * Extrae `tenantId` y `usuarioId` desde `external_reference` (formato `tenantId:userId`
 * o `llave_en_mano:tenantId:userId` o solo un UUID).
 */
function parseExternalRef(raw: unknown): {
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
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const type: string = body.type || url.searchParams.get("type") || url.searchParams.get("topic") || "";
    const action: string = body.action || "";
    const resourceId: string | undefined =
      body?.data?.id?.toString() || url.searchParams.get("data.id") || url.searchParams.get("id") || undefined;

    if (!verificarFirmaMP(req, resourceId)) {
      return NextResponse.json({ error: "Firma de webhook inválida" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const mpToken = process.env.MP_ACCESS_TOKEN;

    if (!supabaseAdmin || !mpToken || !resourceId) {
      return NextResponse.json({
        received: true,
        skipped: !supabaseAdmin ? "missing_supabase_service_role" : !mpToken ? "missing_mp_token" : "missing_resource_id",
      });
    }

    // 1. Notificación de Suscripción (Preapproval)
    if (
      type === "subscription_preapproval" ||
      type === "preapproval" ||
      action.startsWith("subscription_preapproval")
    ) {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      if (!mpRes.ok) {
        return NextResponse.json({ error: "No se pudo consultar preapproval en MP" }, { status: 502 });
      }
      const mpData = await mpRes.json();

      const { tenantId, usuarioId } = parseExternalRef(mpData.external_reference);
      const mpStatus = String(mpData.status || "").toLowerCase();

      const estadoInterno =
        mpStatus === "authorized"
          ? "activa"
          : mpStatus === "paused"
            ? "pausada"
            : mpStatus === "cancelled"
              ? "cancelada"
              : "pendiente";

      const monto = Number(mpData?.auto_recurring?.transaction_amount) || 20000;
      const moneda = String(mpData?.auto_recurring?.currency_id || "ARS");
      const nuevaFechaFin =
        estadoInterno === "activa"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      // Resolver tenant y usuario si solo vino uno de los dos
      let finalTenantId = tenantId;
      let finalUserId = usuarioId;
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
            estado: estadoInterno,
            proveedor: "mercadopago",
            proveedor_suscripcion_id: String(resourceId),
            plan: "Plan Pioneros Mensual (MP)",
            precio: monto,
            moneda,
            fecha_inicio: new Date().toISOString(),
            ...(nuevaFechaFin ? { fecha_fin: nuevaFechaFin } : {}),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" },
        );
      } else if (finalUserId) {
        await supabaseAdmin
          .from("suscripciones")
          .update({
            estado: estadoInterno,
            proveedor: "mercadopago",
            proveedor_suscripcion_id: String(resourceId),
            ...(nuevaFechaFin ? { fecha_fin: nuevaFechaFin } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("usuario_id", finalUserId);
      }
    }

    // 2. Notificación de Pago (Cuota de suscripción o Pago Único "Llave en Mano")
    if (type === "payment" || action.startsWith("payment.")) {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      if (payRes.ok) {
        const payData = await payRes.json();
        const { esLlaveEnMano, tenantId, usuarioId } = parseExternalRef(payData.external_reference);
        const status = String(payData.status || "").toLowerCase();
        const monto = Number(payData.transaction_amount) || 0;
        const moneda = String(payData.currency_id || "ARS");

        if (status === "approved" && (tenantId || usuarioId)) {
          const { data: sub } = tenantId
            ? await supabaseAdmin.from("suscripciones").select("id, fecha_fin").eq("tenant_id", tenantId).maybeSingle()
            : await supabaseAdmin.from("suscripciones").select("id, fecha_fin").eq("usuario_id", usuarioId!).maybeSingle();

          if (sub?.id) {
            // Si no es Llave en Mano, renovamos 30 días la suscripción mensual
            if (!esLlaveEnMano) {
              const baseMs = sub.fecha_fin ? Math.max(Date.now(), new Date(sub.fecha_fin).getTime()) : Date.now();
              const nuevaFin = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
              await supabaseAdmin
                .from("suscripciones")
                .update({
                  estado: "activa",
                  proveedor: "mercadopago",
                  fecha_fin: nuevaFin,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", sub.id);
            }

            // Registrar en historial_pagos_suscripcion
            await supabaseAdmin.from("historial_pagos_suscripcion").upsert(
              {
                suscripcion_id: sub.id,
                proveedor_pago_id: `mp_${resourceId}`,
                monto,
                moneda,
                estado: esLlaveEnMano ? "llave_en_mano_aprobado" : "aprobado",
                fecha_pago: new Date().toISOString(),
              },
              { onConflict: "proveedor_pago_id" },
            );
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook de Mercado Pago:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
