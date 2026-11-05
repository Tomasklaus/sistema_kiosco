"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  calcularEstadoSuscripcion,
  METODOS_PAGO_DEFAULT,
  type EstadoSuscripcion,
  type MetodosPagoNegocio,
} from "@/lib/suscripcion";
import type { ActionResult } from "@/types";

export type { EstadoSuscripcion, MetodosPagoNegocio };

export interface NegocioConfig {
  id: string;
  nombre: string;
  direccion?: string | null;
  telefono?: string | null;
  cuit?: string | null;
  mensaje_ticket?: string | null;
  metodos_pago_activos?: MetodosPagoNegocio | null;
}

export interface SuscripcionInfo {
  id?: string;
  estado: EstadoSuscripcion;
  proveedor?: "mercadopago" | "paypal" | "manual" | "prueba" | null;
  proveedor_suscripcion_id?: string | null;
  plan: string;
  precio: number;
  moneda: string;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  dias_restantes: number;
  operativa: boolean;
}

/** Precio promocional vigente del "Plan Pioneros" (ARS). */
const PRECIO_PLAN_PIONERO = 20000;
/** Precio promocional en USD para PayPal internacional. */
const PRECIO_PLAN_PIONERO_USD = 20;
/** Precio promocional del Servicio "Llave en Mano" (ARS). */
const PRECIO_LLAVE_EN_MANO_ARS = 40000;
const PRECIO_LLAVE_EN_MANO_USD = 30;

function normalizarMetodos(raw: unknown): MetodosPagoNegocio {
  if (!raw || typeof raw !== "object") return { ...METODOS_PAGO_DEFAULT };
  const r = raw as Record<string, unknown>;
  return {
    efectivo: r.efectivo !== false,
    mercadopago: r.mercadopago !== false,
    tarjeta: r.tarjeta !== false,
    cuenta_corriente: r.cuenta_corriente !== false,
  };
}

export async function obtenerMetodosPagoActivos(): Promise<MetodosPagoNegocio> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...METODOS_PAGO_DEFAULT };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, tenants(metodos_pago_activos)")
    .eq("id", user.id)
    .maybeSingle();

  const tenant = profile?.tenants as unknown as { metodos_pago_activos?: unknown } | null;
  return normalizarMetodos(tenant?.metodos_pago_activos);
}

export async function obtenerConfiguracion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, rol, tenant_id, tenants(*)")
    .eq("id", user.id)
    .maybeSingle();

  const tenantRaw = profile?.tenants as unknown as Record<string, unknown> | null;
  const tenantId = (profile?.tenant_id as string | undefined) ?? "";
  const metodosActivos = normalizarMetodos(tenantRaw?.metodos_pago_activos);

  const negocio: NegocioConfig = {
    id: (tenantRaw?.id as string | undefined) ?? tenantId,
    nombre: (tenantRaw?.nombre as string | undefined) ?? "Mi Kiosco",
    metodos_pago_activos: metodosActivos,
  };

  // Buscamos la suscripción por tenant_id (o por usuario_id como fallback si aún no corrieron la migración 0012)
  let sub: Record<string, unknown> | null = null;
  if (tenantId) {
    const { data: subTenant, error: errTenant } = await supabase
      .from("suscripciones")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!errTenant && subTenant) {
      sub = subTenant as Record<string, unknown>;
    }
  }
  if (!sub) {
    const { data: subUser } = await supabase
      .from("suscripciones")
      .select("*")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (subUser) sub = subUser as Record<string, unknown>;
  }

  const calc = calcularEstadoSuscripcion(
    sub
      ? {
          estado: String(sub.estado ?? "inactiva"),
          fecha_fin: (sub.fecha_fin as string | null) ?? null,
        }
      : null,
  );

  const suscripcion: SuscripcionInfo = sub
    ? {
        id: String(sub.id),
        estado: calc.estado,
        proveedor: (sub.proveedor as SuscripcionInfo["proveedor"]) ?? null,
        proveedor_suscripcion_id: (sub.proveedor_suscripcion_id as string | null) ?? null,
        plan: String(sub.plan || "Plan Pioneros Mensual"),
        precio: Number(sub.precio) || PRECIO_PLAN_PIONERO,
        moneda: String(sub.moneda || "ARS"),
        fecha_inicio: (sub.fecha_inicio as string | null) ?? null,
        fecha_fin: (sub.fecha_fin as string | null) ?? null,
        dias_restantes: calc.diasRestantes,
        operativa: calc.operativa,
      }
    : {
        estado: "prueba",
        proveedor: "prueba",
        plan: "Prueba Gratis (7 días)",
        precio: PRECIO_PLAN_PIONERO,
        moneda: "ARS",
        dias_restantes: 7,
        operativa: true,
      };

  return {
    negocio,
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
  if (profile.rol === "cajero") {
    return { ok: false, error: "Solo los administradores pueden editar datos del negocio" };
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      nombre: input.nombre.trim(),
    })
    .eq("id", profile.tenant_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function actualizarMetodosPagoNegocio(
  metodos: MetodosPagoNegocio,
): Promise<ActionResult> {
  if (
    !metodos.efectivo &&
    !metodos.mercadopago &&
    !metodos.tarjeta &&
    !metodos.cuenta_corriente
  ) {
    return { ok: false, error: "Debés dejar al menos un método de cobro habilitado en caja" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, rol")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) return { ok: false, error: "Negocio no encontrado" };
  if (profile.rol === "cajero") {
    return { ok: false, error: "Solo el dueño o administrador puede cambiar los métodos de cobro" };
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      metodos_pago_activos: {
        efectivo: Boolean(metodos.efectivo),
        mercadopago: Boolean(metodos.mercadopago),
        tarjeta: Boolean(metodos.tarjeta),
        cuenta_corriente: Boolean(metodos.cuenta_corriente),
      },
    })
    .eq("id", profile.tenant_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/configuracion");
  revalidatePath("/pos");
  return { ok: true };
}

// =========================================================
// PASARELAS DE PAGO (Mercado Pago & PayPal)
// =========================================================

async function obtenerBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function obtenerContextoCheckout() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, rol, tenants(nombre)")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id || profile.rol === "cajero") return null;
  const tenant = profile.tenants as unknown as { nombre?: string } | null;

  return {
    userId: user.id,
    email: user.email ?? "cliente@kioscopos.com",
    tenantId: profile.tenant_id as string,
    negocioNombre: tenant?.nombre ?? "Mi Kiosco",
  };
}

/**
 * Crea una suscripción mensual en Mercado Pago (Preapproval) o redirige al link
 * de plan configurado en variables de entorno.
 */
export async function iniciarSuscripcionMercadoPago(): Promise<ActionResult<{ url: string }>> {
  const ctx = await obtenerContextoCheckout();
  if (!ctx) return { ok: false, error: "Debés iniciar sesión como dueño o administrador" };

  const baseUrl = await obtenerBaseUrl();
  const externalRef = `${ctx.tenantId}:${ctx.userId}`;

  // 1. Si hay MP_ACCESS_TOKEN, creamos el preapproval dinámico con external_reference y back_url
  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (mpToken) {
    try {
      const response = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: `Suscripción Mensual Kiosco POS (Plan Pioneros) — ${ctx.negocioNombre}`,
          external_reference: externalRef,
          payer_email: ctx.email,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: PRECIO_PLAN_PIONERO,
            currency_id: "ARS",
          },
          back_url: `${baseUrl}/configuracion?pago=mp_exito`,
          status: "pending",
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.init_point) {
        console.error("Error creando preapproval en Mercado Pago:", data);
        return {
          ok: false,
          error:
            data?.message ||
            "No se pudo iniciar la suscripción en Mercado Pago. Verificá tu MP_ACCESS_TOKEN.",
        };
      }

      return { ok: true, data: { url: data.init_point as string } };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Error de red al conectar con Mercado Pago",
      };
    }
  }

  // 2. Fallback si configuraron un link directo de plan de Mercado Pago (MP_SUBSCRIPTION_LINK)
  if (process.env.NEXT_PUBLIC_MP_SUBSCRIPTION_URL) {
    return { ok: true, data: { url: process.env.NEXT_PUBLIC_MP_SUBSCRIPTION_URL } };
  }

  return {
    ok: false,
    error:
      "Falta configurar MP_ACCESS_TOKEN (o NEXT_PUBLIC_MP_SUBSCRIPTION_URL) en las variables de entorno (.env.local).",
  };
}

/**
 * Obtiene un access_token OAuth2 de PayPal (Live o Sandbox según PAYPAL_ENV).
 */
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
 * Crea una suscripción mensual en PayPal (o una orden de cobro si no hay PAYPAL_PLAN_ID)
 * vinculada al `tenant_id` mediante `custom_id`.
 */
export async function iniciarSuscripcionPayPal(): Promise<ActionResult<{ url: string }>> {
  const ctx = await obtenerContextoCheckout();
  if (!ctx) return { ok: false, error: "Debés iniciar sesión como dueño o administrador" };

  const baseUrl = await obtenerBaseUrl();
  const customId = `${ctx.tenantId}:${ctx.userId}`;

  const authPP = await obtenerTokenPayPal();
  const planId = process.env.PAYPAL_PLAN_ID;

  // 1. Si hay credenciales y PAYPAL_PLAN_ID, creamos una suscripción recurrente oficial
  if (authPP && planId) {
    try {
      const res = await fetch(`${authPP.apiBase}/v1/billing/subscriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authPP.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: planId,
          custom_id: customId,
          application_context: {
            brand_name: "Kiosco POS",
            locale: "es-AR",
            shipping_preference: "NO_SHIPPING",
            user_action: "SUBSCRIBE_NOW",
            return_url: `${baseUrl}/configuracion?pago=paypal_exito`,
            cancel_url: `${baseUrl}/configuracion?pago=cancelado`,
          },
        }),
      });

      const data = await res.json();
      const approveLink = Array.isArray(data?.links)
        ? data.links.find((l: { rel?: string; href?: string }) => l.rel === "approve")?.href
        : null;

      if (!res.ok || !approveLink) {
        console.error("Error creando suscripción PayPal:", data);
        return {
          ok: false,
          error: data?.message || "No se pudo crear la suscripción en PayPal.",
        };
      }

      return { ok: true, data: { url: approveLink as string } };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Error de red al conectar con PayPal",
      };
    }
  }

  // 2. Si hay credenciales pero no crearon un Plan ID todavía, creamos una Orden en USD ($20.00)
  //    para que funcione de inmediato sin depender de configurar un catálogo de Billing Plans
  if (authPP) {
    try {
      const res = await fetch(`${authPP.apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authPP.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              custom_id: customId,
              description: `Suscripción Mensual Kiosco POS (Plan Pioneros) — ${ctx.negocioNombre}`,
              amount: {
                currency_code: "USD",
                value: PRECIO_PLAN_PIONERO_USD.toFixed(2),
              },
            },
          ],
          application_context: {
            brand_name: "Kiosco POS",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${baseUrl}/configuracion?pago=paypal_exito`,
            cancel_url: `${baseUrl}/configuracion?pago=cancelado`,
          },
        }),
      });

      const data = await res.json();
      const approveLink = Array.isArray(data?.links)
        ? data.links.find((l: { rel?: string; href?: string }) => l.rel === "approve")?.href
        : null;

      if (!res.ok || !approveLink) {
        return {
          ok: false,
          error: data?.message || "No se pudo iniciar el checkout en PayPal.",
        };
      }

      return { ok: true, data: { url: approveLink as string } };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Error de red al conectar con PayPal",
      };
    }
  }

  // 3. Fallback a link directo si se definió por variable de entorno
  if (process.env.NEXT_PUBLIC_PAYPAL_SUBSCRIPTION_URL) {
    return { ok: true, data: { url: process.env.NEXT_PUBLIC_PAYPAL_SUBSCRIPTION_URL } };
  }

  return {
    ok: false,
    error:
      "Falta configurar PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET (o NEXT_PUBLIC_PAYPAL_SUBSCRIPTION_URL) en .env.local.",
  };
}

/**
 * Inicia el Checkout de Pago Único del Servicio "Llave en Mano" (Mercado Pago o PayPal).
 */
export async function iniciarPagoLlaveEnMano(
  proveedor: "mercadopago" | "paypal" = "mercadopago",
): Promise<ActionResult<{ url: string }>> {
  const ctx = await obtenerContextoCheckout();
  if (!ctx) return { ok: false, error: "Debés iniciar sesión como dueño o administrador" };

  const baseUrl = await obtenerBaseUrl();
  const externalRef = `llave_en_mano:${ctx.tenantId}:${ctx.userId}`;

  if (proveedor === "mercadopago") {
    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (mpToken) {
      try {
        const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mpToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: [
              {
                id: "llave_en_mano",
                title: `Servicio Llave en Mano — Kiosco POS (${ctx.negocioNombre})`,
                description:
                  "Carga inicial de catálogo, configuración de lector de barras y capacitación en vivo.",
                quantity: 1,
                currency_id: "ARS",
                unit_price: PRECIO_LLAVE_EN_MANO_ARS,
              },
            ],
            payer: { email: ctx.email },
            external_reference: externalRef,
            back_urls: {
              success: `${baseUrl}/configuracion?pago=llave_exito`,
              failure: `${baseUrl}/configuracion?pago=cancelado`,
              pending: `${baseUrl}/configuracion?pago=pendiente`,
            },
            auto_return: "approved",
            notification_url: `${baseUrl}/api/webhooks/mercadopago`,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.init_point) {
          return {
            ok: false,
            error: data?.message || "No se pudo crear la preferencia de pago en Mercado Pago",
          };
        }
        return { ok: true, data: { url: data.init_point as string } };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Error al conectar con Mercado Pago",
        };
      }
    }

    if (process.env.NEXT_PUBLIC_MP_LLAVE_EN_MANO_URL) {
      return { ok: true, data: { url: process.env.NEXT_PUBLIC_MP_LLAVE_EN_MANO_URL } };
    }

    return {
      ok: false,
      error:
        "Falta configurar MP_ACCESS_TOKEN (o NEXT_PUBLIC_MP_LLAVE_EN_MANO_URL) en .env.local para cobrar online. Podés coordinar el pago directamente por WhatsApp.",
    };
  }

  // Pago único con PayPal ($30 USD)
  const authPP = await obtenerTokenPayPal();
  if (authPP) {
    try {
      const res = await fetch(`${authPP.apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authPP.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              custom_id: externalRef,
              description: `Servicio Llave en Mano — Kiosco POS (${ctx.negocioNombre})`,
              amount: {
                currency_code: "USD",
                value: PRECIO_LLAVE_EN_MANO_USD.toFixed(2),
              },
            },
          ],
          application_context: {
            brand_name: "Kiosco POS",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${baseUrl}/configuracion?pago=llave_exito`,
            cancel_url: `${baseUrl}/configuracion?pago=cancelado`,
          },
        }),
      });

      const data = await res.json();
      const approveLink = Array.isArray(data?.links)
        ? data.links.find((l: { rel?: string; href?: string }) => l.rel === "approve")?.href
        : null;

      if (!res.ok || !approveLink) {
        return { ok: false, error: data?.message || "No se pudo crear la orden en PayPal" };
      }
      return { ok: true, data: { url: approveLink as string } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Error al conectar con PayPal" };
    }
  }

  return {
    ok: false,
    error: "Falta configurar PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en .env.local.",
  };
}
