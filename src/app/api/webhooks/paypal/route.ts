import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const eventType = body.event_type;

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED" || eventType === "BILLING.SUBSCRIPTION.UPDATED") {
      const subscription = body.resource;
      const subscriptionId = subscription.id;
      const customId = subscription.custom_id; // Deberías pasar el ID del usuario como custom_id al crear la suscripción

      /*
      await supabaseAdmin
        .from("suscripciones")
        .update({ 
          estado: "activa",
          proveedor_suscripcion_id: subscriptionId,
          fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq("usuario_id", customId);
      */
    } else if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
      const subscription = body.resource;
      /*
      await supabaseAdmin
        .from("suscripciones")
        .update({ estado: "cancelada" })
        .eq("proveedor_suscripcion_id", subscription.id);
      */
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook de PayPal:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
