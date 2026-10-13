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
    const { action, data, type } = body;

    // Mercado Pago envía notificaciones de tipo "subscription_preapproval" o "payment"
    if (type === "subscription_preapproval" || action === "created" || action === "updated") {
      const subscriptionId = data.id;
      
      // Aquí se debe llamar a la API de Mercado Pago para consultar el estado real
      // const mpResponse = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
      //   headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      // });
      // const mpData = await mpResponse.json();
      
      // Simulación: asumiendo mpData.status === 'authorized'
      const status = "activa"; // Depende de la respuesta de MP
      const externalReference = "ID_DEL_USUARIO"; // Deberías pasarlo al crear la suscripción (external_reference)

      // Actualizar en base de datos
      /*
      await supabaseAdmin
        .from("suscripciones")
        .update({ 
          estado: status,
          proveedor_suscripcion_id: subscriptionId,
          fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // +30 días
        })
        .eq("usuario_id", externalReference);
      */
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook de MP:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
