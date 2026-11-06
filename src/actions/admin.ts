"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, RolUsuario } from "@/types";
import type { EstadoSuscripcion } from "@/actions/configuracion";

const SUPERADMIN_EMAILS = [
  "tomasklaus17@gmail.com",
  ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()) : []),
];

export interface AdminResumen {
  negocios: number;
  usuarios: number;
  nuevos_7d: number;
  activos_7d: number;
  ventas_total: number;
  monto_total: number;
  ventas_30d: number;
  monto_30d: number;
  ticket_promedio: number;
  porcentaje_activos: number;
  desglose_pagos: Record<string, { cantidad: number; monto: number }>;
  desglose_suscripciones: {
    prueba: number;
    activa: number;
    pausada: number;
    vencida: number;
    otras: number;
  };
}

export interface AdminTenant {
  id: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  owner_email?: string | null;
  owner_nombre?: string | null;
  usuarios: number;
  productos: number;
  ventas: number;
  monto: number;
  ultima_venta: string | null;
  suscripcion_id?: string | null;
  suscripcion_estado?: EstadoSuscripcion;
  suscripcion_plan?: string;
  suscripcion_proveedor?: string;
  suscripcion_fecha_fin?: string | null;
  dias_restantes?: number;
  metodos_pago_activos?: Record<string, boolean>;
  miembros?: { id: string; nombre: string | null; email: string | null; rol: string; activo: boolean }[];
}

export interface AdminUsuario {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: RolUsuario;
  activo: boolean;
  tenant_id: string;
  tenant_nombre: string;
  created_at: string;
  es_superadmin: boolean;
}

export interface AdminDia {
  dia: string;
  ventas: number;
  monto: number;
  nuevos_negocios: number;
}

export interface AdminSaludSistema {
  supabaseOk: boolean;
  supabaseUrl: string;
  mercadoPagoConfigurado: boolean;
  paypalConfigurado: boolean;
  whatsappConfigurado: boolean;
  totalProductosPlataforma: number;
}

export interface PanelAdminData {
  resumen: AdminResumen;
  tenants: AdminTenant[];
  usuarios: AdminUsuario[];
  actividad: AdminDia[];
  salud: AdminSaludSistema;
  superadminActualEmail: string;
}

/**
 * Determina si el usuario autenticado tiene rol de SuperAdmin de la plataforma.
 * Reconoce tanto a tomasklaus17@gmail.com como a cualquier usuario en `platform_admins`.
 */
export async function esPlatformAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const email = user.email?.toLowerCase().trim();
    if (email && SUPERADMIN_EMAILS.includes(email)) {
      // Aseguramos que su ID exista en platform_admins de la BD
      try {
        const adminClient = createAdminClient();
        await adminClient
          .from("platform_admins")
          .upsert({ user_id: user.id }, { onConflict: "user_id" });
      } catch {
        // No bloquear si ya existe
      }
      return true;
    }

    const { data } = await supabase.rpc("is_platform_admin");
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Obtiene toda la información agregada y detallada para el panel SuperAdmin.
 */
export async function obtenerPanelAdmin(): Promise<PanelAdminData | null> {
  const esAdmin = await esPlatformAdmin();
  if (!esAdmin) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const superadminActualEmail = user?.email ?? "tomasklaus17@gmail.com";

    const adminClient = createAdminClient();

    // Consultas paralelas usando permisos de servicio para evitar bloqueos de RLS
    const [
      tenantsRes,
      profilesRes,
      ventasRes,
      productosRes,
      platformAdminsRes,
      suscripcionesRes,
    ] = await Promise.all([
      adminClient.from("tenants").select("*").order("created_at", { ascending: false }),
      adminClient.from("profiles").select("*, tenants(nombre)").order("created_at", { ascending: false }),
      adminClient.from("ventas").select("id, total, metodo_pago, created_at, tenant_id, estado").order("created_at", { ascending: false }),
      adminClient.from("productos").select("id, tenant_id"),
      adminClient.from("platform_admins").select("user_id"),
      adminClient.from("suscripciones").select("*").order("created_at", { ascending: false }),
    ]);

    const tenantsData = tenantsRes.data ?? [];
    const profilesData = profilesRes.data ?? [];
    const ventasCompletadas = (ventasRes.data ?? []).filter((v) => v.estado === "completada");
    const productosData = productosRes.data ?? [];
    const superadminIds = new Set(
      (platformAdminsRes.data ?? []).map((p) => p.user_id)
    );
    // Asegurar que tomasklaus17@gmail.com esté marcado como superadmin
    profilesData.forEach((p) => {
      if (p.email && SUPERADMIN_EMAILS.includes(p.email.toLowerCase())) {
        superadminIds.add(p.id);
      }
    });

    const ahora = Date.now();
    const hace7Dias = ahora - 7 * 86400_000;
    const hace30Dias = ahora - 30 * 86400_000;

    // Calcular KPIs de ventas
    const montoTotal = ventasCompletadas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
    const ventas30d = ventasCompletadas.filter(
      (v) => new Date(v.created_at).getTime() >= hace30Dias
    );
    const monto30d = ventas30d.reduce((acc, v) => acc + (Number(v.total) || 0), 0);

    // Desglose por método de pago
    const desglosePagos: Record<string, { cantidad: number; monto: number }> = {};
    ventasCompletadas.forEach((v) => {
      const metodo = v.metodo_pago || "otros";
      if (!desglosePagos[metodo]) desglosePagos[metodo] = { cantidad: 0, monto: 0 };
      desglosePagos[metodo].cantidad += 1;
      desglosePagos[metodo].monto += Number(v.total) || 0;
    });

    // Negocios con ventas en los últimos 7 días
    const tenantsConVentas7d = new Set(
      ventasCompletadas
        .filter((v) => new Date(v.created_at).getTime() >= hace7Dias)
        .map((v) => v.tenant_id)
    );

    const nuevosTenants7d = tenantsData.filter(
      (t) => new Date(t.created_at).getTime() >= hace7Dias
    ).length;

    // Mapas de ayuda para enriquecer los comercios
    const productosPorTenant = new Map<string, number>();
    productosData.forEach((p) => {
      if (p.tenant_id) {
        productosPorTenant.set(p.tenant_id, (productosPorTenant.get(p.tenant_id) ?? 0) + 1);
      }
    });

    const ventasPorTenant = new Map<string, { count: number; monto: number; ultima: string | null }>();
    ventasCompletadas.forEach((v) => {
      if (!v.tenant_id) return;
      const prev = ventasPorTenant.get(v.tenant_id) ?? { count: 0, monto: 0, ultima: null };
      prev.count += 1;
      prev.monto += Number(v.total) || 0;
      if (!prev.ultima || new Date(v.created_at) > new Date(prev.ultima)) {
        prev.ultima = v.created_at;
      }
      ventasPorTenant.set(v.tenant_id, prev);
    });

    const perfilesPorTenant = new Map<string, typeof profilesData>();
    profilesData.forEach((p) => {
      if (p.tenant_id) {
        const list = perfilesPorTenant.get(p.tenant_id) ?? [];
        list.push(p);
        perfilesPorTenant.set(p.tenant_id, list);
      }
    });

    const suscripcionesPorTenant = new Map<string, NonNullable<typeof suscripcionesRes.data>[number]>();
    (suscripcionesRes.data ?? []).forEach((s) => {
      if (s.tenant_id && !suscripcionesPorTenant.has(s.tenant_id)) {
        suscripcionesPorTenant.set(s.tenant_id, s);
      }
    });

    const desgloseSuscripciones = { prueba: 0, activa: 0, pausada: 0, vencida: 0, otras: 0 };

    // Enriquecer tenants
    const tenantsEnriquecidos: AdminTenant[] = tenantsData.map((t) => {
      const sub = suscripcionesPorTenant.get(t.id);
      const perfiles = perfilesPorTenant.get(t.id) ?? [];
      const owner = perfiles.find((p) => p.rol === "owner") ?? perfiles[0];
      const statsVenta = ventasPorTenant.get(t.id) ?? { count: 0, monto: 0, ultima: null };

      const estadoSub: EstadoSuscripcion =
        (sub?.estado as EstadoSuscripcion) ??
        (t.subscription_status === "trialing" ? "prueba" : "prueba");

      const fechaFin = sub?.fecha_fin ?? t.trial_ends_at ?? null;
      let diasRestantes = 7;
      if (fechaFin) {
        diasRestantes = Math.ceil((new Date(fechaFin).getTime() - ahora) / 86400_000);
      }

      const estaVencida =
        (estadoSub === "prueba" || estadoSub === "activa") && diasRestantes < 0;

      if (estaVencida) {
        desgloseSuscripciones.vencida += 1;
      } else if (estadoSub === "activa") {
        desgloseSuscripciones.activa += 1;
      } else if (estadoSub === "prueba") {
        desgloseSuscripciones.prueba += 1;
      } else if (estadoSub === "pausada") {
        desgloseSuscripciones.pausada += 1;
      } else {
        desgloseSuscripciones.otras += 1;
      }

      return {
        id: t.id,
        nombre: t.nombre || "Sin nombre",
        activo: t.activo ?? true,
        created_at: t.created_at,
        owner_email: owner?.email ?? null,
        owner_nombre: owner?.nombre ?? null,
        usuarios: perfiles.length,
        productos: productosPorTenant.get(t.id) ?? 0,
        ventas: statsVenta.count,
        monto: statsVenta.monto,
        ultima_venta: statsVenta.ultima,
        suscripcion_id: sub?.id ?? null,
        suscripcion_estado: estadoSub,
        suscripcion_plan: sub?.plan ?? (estadoSub === "prueba" ? "Prueba Gratis (7d)" : "Plan Pioneros"),
        suscripcion_proveedor: sub?.proveedor ?? "manual",
        suscripcion_fecha_fin: fechaFin,
        dias_restantes: diasRestantes,
        metodos_pago_activos: t.metodos_pago_activos as Record<string, boolean> | undefined,
        miembros: perfiles.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          email: m.email,
          rol: m.rol,
          activo: m.activo,
        })),
      };
    });

    // Enriquecer usuarios
    const usuariosEnriquecidos: AdminUsuario[] = profilesData.map((p) => {
      const tenantInfo = p.tenants as unknown as { nombre: string } | null;
      const esSuperAdmin = superadminIds.has(p.id);
      return {
        id: p.id,
        email: p.email,
        nombre: p.nombre,
        rol: p.rol as RolUsuario,
        activo: p.activo ?? true,
        tenant_id: p.tenant_id,
        tenant_nombre: tenantInfo?.nombre || "Sin negocio",
        created_at: p.created_at,
        es_superadmin: esSuperAdmin,
      };
    });

    // Construir actividad de los últimos 30 días
    const actividadDiasMap = new Map<string, { ventas: number; monto: number; nuevos_negocios: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(ahora - i * 86400_000);
      const iso = d.toISOString().slice(0, 10);
      actividadDiasMap.set(iso, { ventas: 0, monto: 0, nuevos_negocios: 0 });
    }

    ventasCompletadas.forEach((v) => {
      const iso = v.created_at.slice(0, 10);
      if (actividadDiasMap.has(iso)) {
        const item = actividadDiasMap.get(iso)!;
        item.ventas += 1;
        item.monto += Number(v.total) || 0;
      }
    });

    tenantsData.forEach((t) => {
      const iso = t.created_at.slice(0, 10);
      if (actividadDiasMap.has(iso)) {
        actividadDiasMap.get(iso)!.nuevos_negocios += 1;
      }
    });

    const actividad: AdminDia[] = Array.from(actividadDiasMap.entries()).map(([dia, data]) => ({
      dia,
      ventas: data.ventas,
      monto: data.monto,
      nuevos_negocios: data.nuevos_negocios,
    }));

    const resumen: AdminResumen = {
      negocios: tenantsData.length,
      usuarios: profilesData.length,
      nuevos_7d: nuevosTenants7d,
      activos_7d: tenantsConVentas7d.size,
      ventas_total: ventasCompletadas.length,
      monto_total: montoTotal,
      ventas_30d: ventas30d.length,
      monto_30d: monto30d,
      ticket_promedio: ventasCompletadas.length ? Math.round(montoTotal / ventasCompletadas.length) : 0,
      porcentaje_activos: tenantsData.length
        ? Math.round((tenantsConVentas7d.size / tenantsData.length) * 100)
        : 0,
      desglose_pagos: desglosePagos,
      desglose_suscripciones: desgloseSuscripciones,
    };

    const salud: AdminSaludSistema = {
      supabaseOk: true,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      mercadoPagoConfigurado: Boolean(process.env.MP_ACCESS_TOKEN),
      paypalConfigurado: Boolean(process.env.PAYPAL_CLIENT_ID),
      whatsappConfigurado: Boolean(process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL),
      totalProductosPlataforma: productosData.length,
    };

    return {
      resumen,
      tenants: tenantsEnriquecidos,
      usuarios: usuariosEnriquecidos,
      actividad,
      salud,
      superadminActualEmail,
    };
  } catch (err) {
    console.error("Error al obtener panel admin:", err);
    return null;
  }
}

/**
 * Suma (o resta si es negativo) días al período de prueba o suscripción de un negocio.
 */
export async function adminAgregarDiasSuscripcion(
  tenantId: string,
  dias: number
): Promise<ActionResult<{ estado: string; fecha_fin: string }>> {
  const esAdmin = await esPlatformAdmin();
  if (!esAdmin) return { ok: false, error: "No autorizado" };

  if (!tenantId || !Number.isFinite(dias) || dias === 0) {
    return { ok: false, error: "Indicá una cantidad de días válida distinta de cero" };
  }

  try {
    const adminClient = createAdminClient();

    // Buscar suscripción actual del tenant
    const { data: sub } = await adminClient
      .from("suscripciones")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const ahora = Date.now();
    let baseDate = ahora;

    if (sub?.fecha_fin) {
      const parsedFin = new Date(sub.fecha_fin).getTime();
      if (parsedFin > ahora) {
        baseDate = parsedFin;
      }
    }

    const nuevaFinDate = new Date(baseDate + Math.trunc(dias) * 86400_000);
    const nuevaFinIso = nuevaFinDate.toISOString();
    const nuevoEstado = nuevaFinDate.getTime() > ahora ? (sub?.estado === "pausada" ? "pausada" : "activa") : "inactiva";

    if (sub?.id) {
      await adminClient
        .from("suscripciones")
        .update({
          fecha_fin: nuevaFinIso,
          estado: nuevoEstado,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
    } else {
      // Obtener owner del tenant
      const { data: owner } = await adminClient
        .from("profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("rol", "owner")
        .maybeSingle();

      await adminClient.from("suscripciones").insert({
        tenant_id: tenantId,
        usuario_id: owner?.id,
        estado: nuevoEstado,
        plan: "Plan Manual Admin",
        precio: 20000,
        moneda: "ARS",
        fecha_inicio: new Date().toISOString(),
        fecha_fin: nuevaFinIso,
      });
    }

    // Actualizar también en tabla tenants para sincronía
    await adminClient
      .from("tenants")
      .update({
        trial_ends_at: nuevaFinIso,
        subscription_status: nuevoEstado,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    revalidatePath("/admin");
    revalidatePath("/configuracion");
    revalidatePath("/", "layout");

    return { ok: true, data: { estado: nuevoEstado, fecha_fin: nuevaFinIso } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al agregar días";
    return { ok: false, error: msg };
  }
}

/**
 * Cambia el estado de la suscripción de un negocio (`activa`, `pausada`, `prueba`, `cancelada`).
 */
export async function adminCambiarEstadoSuscripcion(
  tenantId: string,
  estado: "prueba" | "activa" | "pausada" | "inactiva" | "cancelada",
  plan?: string
): Promise<ActionResult<{ estado: string; plan: string; fecha_fin: string }>> {
  const esAdmin = await esPlatformAdmin();
  if (!esAdmin) return { ok: false, error: "No autorizado" };
  if (!tenantId) return { ok: false, error: "Negocio inválido" };

  try {
    const adminClient = createAdminClient();

    const { data: sub } = await adminClient
      .from("suscripciones")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const ahora = new Date();
    let fechaFin = sub?.fecha_fin;

    if (estado === "activa" && (!fechaFin || new Date(fechaFin) < ahora)) {
      fechaFin = new Date(Date.now() + 30 * 86400_000).toISOString();
    } else if (estado === "prueba" && (!fechaFin || new Date(fechaFin) < ahora)) {
      fechaFin = new Date(Date.now() + 7 * 86400_000).toISOString();
    }

    const planElegido =
      plan ||
      sub?.plan ||
      (estado === "prueba" ? "Prueba Gratis (7 días)" : "Plan Pioneros Mensual");

    if (sub?.id) {
      await adminClient
        .from("suscripciones")
        .update({
          estado,
          plan: planElegido,
          fecha_fin: fechaFin,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
    } else {
      const { data: owner } = await adminClient
        .from("profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("rol", "owner")
        .maybeSingle();

      await adminClient.from("suscripciones").insert({
        tenant_id: tenantId,
        usuario_id: owner?.id,
        estado,
        plan: planElegido,
        precio: 20000,
        moneda: "ARS",
        fecha_inicio: ahora.toISOString(),
        fecha_fin: fechaFin,
      });
    }

    await adminClient
      .from("tenants")
      .update({
        subscription_status: estado,
        trial_ends_at: fechaFin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    revalidatePath("/admin");
    revalidatePath("/configuracion");
    revalidatePath("/", "layout");

    return {
      ok: true,
      data: { estado, plan: planElegido, fecha_fin: fechaFin || ahora.toISOString() },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al cambiar estado";
    return { ok: false, error: msg };
  }
}

/**
 * Pausa o activa el acceso completo a un negocio (tenant).
 */
export async function adminCambiarEstadoTenant(
  tenantId: string,
  activo: boolean
): Promise<ActionResult<{ activo: boolean }>> {
  const esAdmin = await esPlatformAdmin();
  if (!esAdmin) return { ok: false, error: "No autorizado" };

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("tenants")
      .update({ activo, updated_at: new Date().toISOString() })
      .eq("id", tenantId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin");
    revalidatePath("/pos");
    return { ok: true, data: { activo } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al modificar negocio";
    return { ok: false, error: msg };
  }
}

/**
 * Concede o revoca permisos de SuperAdmin de plataforma a un usuario.
 */
export async function adminToggleSuperAdmin(
  userId: string,
  targetEmail: string,
  hacerAdmin: boolean
): Promise<ActionResult<{ esSuperAdmin: boolean }>> {
  const esAdmin = await esPlatformAdmin();
  if (!esAdmin) return { ok: false, error: "No autorizado" };

  if (targetEmail.toLowerCase() === "tomasklaus17@gmail.com" && !hacerAdmin) {
    return { ok: false, error: "No podés revocar los permisos del SuperAdmin principal" };
  }

  try {
    const adminClient = createAdminClient();
    if (hacerAdmin) {
      const { error } = await adminClient
        .from("platform_admins")
        .upsert({ user_id: userId, created_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await adminClient
        .from("platform_admins")
        .delete()
        .eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/admin");
    return { ok: true, data: { esSuperAdmin: hacerAdmin } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al modificar permisos";
    return { ok: false, error: msg };
  }
}
