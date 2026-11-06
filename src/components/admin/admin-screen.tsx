"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlayCircle,
  Search,
  Sparkles,
  XCircle,
  ShieldCheck,
  Store,
  Users,
  DollarSign,
  TrendingUp,
  Download,
  RefreshCw,
  CreditCard,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  UserCheck,
  UserX,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminAgregarDiasSuscripcion,
  adminCambiarEstadoSuscripcion,
  adminCambiarEstadoTenant,
  adminToggleSuperAdmin,
  type PanelAdminData,
  type AdminTenant,
  type AdminUsuario,
} from "@/actions/admin";
import { cn, formatARS } from "@/lib/utils";

const fecha = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—";

function KpiCard({
  titulo,
  valor,
  subtitulo,
  icono: Icon,
  gradiente,
  borde,
  colorTexto,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icono: React.ElementType;
  gradiente: string;
  borde: string;
  colorTexto: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 bg-gradient-to-br backdrop-blur-sm relative overflow-hidden",
        gradiente,
        borde
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider font-semibold opacity-75">{titulo}</p>
        <div className="p-2 rounded-xl bg-white/10 text-white">
          <Icon className="size-4" />
        </div>
      </div>
      <p className={cn("mt-3 text-3xl font-extrabold tracking-tight", colorTexto)}>{valor}</p>
      {subtitulo && <p className="mt-1 text-xs opacity-80 font-medium">{subtitulo}</p>}
    </div>
  );
}

function Barras({
  titulo,
  datos,
  fmt,
}: {
  titulo: string;
  datos: { dia: string; v: number }[];
  fmt: (n: number) => string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.v));
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-200">{titulo}</h3>
      <div className="flex h-36 items-end gap-1">
        {datos.map((d) => (
          <div
            key={d.dia}
            className="group flex h-full flex-1 flex-col justify-end"
            title={`${d.dia}: ${fmt(d.v)}`}
          >
            <div
              className="w-full rounded-t bg-gradient-to-t from-emerald-600 via-teal-500 to-emerald-300 transition-all group-hover:brightness-125"
              style={{ height: `${Math.max(3, (d.v / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500 font-mono">
        <span>{datos[0]?.dia.slice(5)}</span>
        <span>{datos[Math.floor(datos.length / 2)]?.dia.slice(5)}</span>
        <span>{datos.at(-1)?.dia.slice(5)}</span>
      </div>
    </div>
  );
}

function BadgeSuscripcion({ tenant }: { tenant: AdminTenant }) {
  const estado = tenant.suscripcion_estado ?? "prueba";
  const dias = tenant.dias_restantes ?? 7;
  const vencida = (estado === "prueba" || estado === "activa") && dias < 0;

  if (vencida) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2.5 py-0.5 text-[10px] font-bold text-red-300">
        <XCircle className="size-3" />
        Vencida ({Math.abs(dias)}d)
      </span>
    );
  }

  switch (estado) {
    case "activa":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
          <CheckCircle2 className="size-3" />
          Activa ({dias}d)
        </span>
      );
    case "prueba":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
          <Sparkles className="size-3" />
          Prueba ({dias}d)
        </span>
      );
    case "pausada":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
          <PauseCircle className="size-3" />
          Pausada
        </span>
      );
    case "inactiva":
    case "cancelada":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-0.5 text-[10px] font-bold text-slate-400">
          <XCircle className="size-3" />
          {estado === "cancelada" ? "Cancelada" : "Inactiva"}
        </span>
      );
  }
}

export function AdminScreen({
  resumen: r,
  tenants,
  usuarios,
  actividad,
  salud,
  superadminActualEmail,
}: PanelAdminData) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"general" | "tenants" | "usuarios" | "salud">("general");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [diasCustomPorTenant, setDiasCustomPorTenant] = useState<Record<string, string>>({});
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

  const ahora = Date.now();

  const handleAgregarDias = (tenant: AdminTenant, dias: number) => {
    if (!Number.isFinite(dias) || dias === 0) {
      toast.error("Ingresá una cantidad de días válida distinta de 0");
      return;
    }
    startTransition(async () => {
      const res = await adminAgregarDiasSuscripcion(tenant.id, dias);
      if (!res.ok) {
        toast.error(res.error || "No se pudieron modificar los días");
        return;
      }
      toast.success(
        `${dias > 0 ? `+${dias}` : dias} días aplicados a "${tenant.nombre}" (vence ${fecha(res.data?.fecha_fin)})`
      );
      setDiasCustomPorTenant((prev) => ({ ...prev, [tenant.id]: "" }));
      router.refresh();
    });
  };

  const handleCambiarEstado = (
    tenant: AdminTenant,
    estado: "prueba" | "activa" | "pausada" | "cancelada"
  ) => {
    startTransition(async () => {
      const res = await adminCambiarEstadoSuscripcion(tenant.id, estado);
      if (!res.ok) {
        toast.error(res.error || "No se pudo cambiar el estado");
        return;
      }
      const etiquetas: Record<string, string> = {
        activa: "activada",
        pausada: "pausada",
        prueba: "puesta en prueba gratis",
        cancelada: "cancelada",
      };
      toast.success(`Suscripción de "${tenant.nombre}" ${etiquetas[estado] ?? estado}`);
      router.refresh();
    });
  };

  const handleToggleTenantActivo = (tenant: AdminTenant) => {
    const nuevoEstado = !tenant.activo;
    startTransition(async () => {
      const res = await adminCambiarEstadoTenant(tenant.id, nuevoEstado);
      if (!res.ok) {
        toast.error(res.error || "No se pudo actualizar el estado del comercio");
        return;
      }
      toast.success(
        nuevoEstado
          ? `Comercio "${tenant.nombre}" reactivado con éxito`
          : `Comercio "${tenant.nombre}" pausado preventivamente`
      );
      router.refresh();
    });
  };

  const handleToggleSuperAdmin = (u: AdminUsuario) => {
    const nuevoRol = !u.es_superadmin;
    if (u.email?.toLowerCase() === "tomasklaus17@gmail.com" && !nuevoRol) {
      toast.error("No podés quitarle los privilegios al SuperAdmin principal");
      return;
    }
    startTransition(async () => {
      const res = await adminToggleSuperAdmin(u.id, u.email || "", nuevoRol);
      if (!res.ok) {
        toast.error(res.error || "Error al modificar permisos");
        return;
      }
      toast.success(
        nuevoRol
          ? `Permisos SuperAdmin concedidos a ${u.nombre || u.email}`
          : `Permisos SuperAdmin removidos a ${u.nombre || u.email}`
      );
      router.refresh();
    });
  };

  const exportarCSV = () => {
    const encabezados = [
      "ID",
      "Nombre",
      "Estado_Negocio",
      "Fecha_Alta",
      "Dueño_Email",
      "Dueño_Nombre",
      "Usuarios",
      "Productos",
      "Ventas",
      "Total_Facturado_ARS",
      "Estado_Suscripcion",
      "Plan",
      "Dias_Restantes",
      "Fecha_Fin_Suscripcion",
    ];

    const filas = tenants.map((t) => [
      t.id,
      `"${t.nombre.replace(/"/g, '""')}"`,
      t.activo ? "Activo" : "Pausado",
      t.created_at,
      t.owner_email ?? "",
      `"${(t.owner_nombre ?? "").replace(/"/g, '""')}"`,
      t.usuarios,
      t.productos,
      t.ventas,
      t.monto,
      t.suscripcion_estado ?? "prueba",
      `"${(t.suscripcion_plan ?? "").replace(/"/g, '""')}"`,
      t.dias_restantes ?? 0,
      t.suscripcion_fecha_fin ?? "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [encabezados.join(","), ...filas.map((f) => f.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kiosco_pos_tenants_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Listado de comercios exportado a CSV");
  };

  const tenantsFiltrados = tenants.filter((t) => {
    const q = busqueda.trim().toLowerCase();
    const coincideTexto =
      !q ||
      t.nombre.toLowerCase().includes(q) ||
      (t.owner_email ?? "").toLowerCase().includes(q) ||
      (t.owner_nombre ?? "").toLowerCase().includes(q);
    if (!coincideTexto) return false;
    if (filtroEstado === "todos") return true;
    const est = t.suscripcion_estado ?? "prueba";
    const vencida = (est === "prueba" || est === "activa") && (t.dias_restantes ?? 7) < 0;
    if (filtroEstado === "vencida") return vencida;
    if (filtroEstado === "activa") return est === "activa" && !vencida;
    if (filtroEstado === "prueba") return est === "prueba" && !vencida;
    return est === filtroEstado && !vencida;
  });

  const usuariosFiltrados = usuarios.filter((u) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      (u.nombre ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.tenant_nombre.toLowerCase().includes(q)
    );
  });

  return (
    <div className="scroll-thin flex h-full flex-col gap-5 overflow-y-auto pr-1 pb-10">
      {/* Barra Superior con Identidad SuperAdmin */}
      <div className="panel p-5 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-900/90 via-[#0b1020] to-slate-900/90 border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-950/70 rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="size-6 text-emerald-300" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Plataforma SuperAdmin</h1>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/40">
                Control Total
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sesión activa como SuperAdmin:{" "}
              <strong className="text-emerald-300">{superadminActualEmail}</strong>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                router.refresh();
                toast.info("Datos de la plataforma sincronizados");
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
            title="Refrescar métricas"
          >
            <RefreshCw className={cn("size-3.5", pending && "animate-spin text-emerald-400")} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={exportarCSV}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
            title="Descargar base de datos de comercios en archivo CSV"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Navegación por Pestañas del Panel Admin */}
      <div className="grid grid-cols-2 md:grid-cols-4 p-1.5 bg-black/40 rounded-2xl border border-white/10 gap-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={cn(
            "py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all",
            activeTab === "general"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <TrendingUp className="size-4" />
          Vista General & Finanzas
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tenants")}
          className={cn(
            "py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all",
            activeTab === "tenants"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Store className="size-4" />
          Comercios & Planes ({tenants.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("usuarios")}
          className={cn(
            "py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all",
            activeTab === "usuarios"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Users className="size-4" />
          Usuarios Globales ({usuarios.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("salud")}
          className={cn(
            "py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all",
            activeTab === "salud"
              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold shadow-md shadow-emerald-950/40"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          )}
        >
          <Activity className="size-4" />
          Salud & Pasarelas
        </button>
      </div>

      {/* ======================================================== */}
      {/* PESTAÑA 1: VISTA GENERAL & FINANZAS                     */}
      {/* ======================================================== */}
      {activeTab === "general" && (
        <div className="space-y-5">
          {/* Tarjetas Principales KPI */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              titulo="Facturación Histórica"
              valor={formatARS(Number(r.monto_total))}
              subtitulo={`${r.ventas_total} ventas procesadas`}
              icono={DollarSign}
              gradiente="from-emerald-500/20 to-emerald-500/5"
              borde="border-emerald-500/30"
              colorTexto="text-emerald-300"
            />
            <KpiCard
              titulo="Facturado (30 Días)"
              valor={formatARS(Number(r.monto_30d))}
              subtitulo={`${r.ventas_30d} ventas este mes`}
              icono={TrendingUp}
              gradiente="from-teal-500/20 to-teal-500/5"
              borde="border-teal-500/30"
              colorTexto="text-teal-300"
            />
            <KpiCard
              titulo="Ticket Promedio"
              valor={formatARS(r.ticket_promedio)}
              subtitulo="Promedio por venta completada"
              icono={Activity}
              gradiente="from-sky-500/20 to-sky-500/5"
              borde="border-sky-500/30"
              colorTexto="text-sky-300"
            />
            <KpiCard
              titulo="Comercios Activos"
              valor={`${r.activos_7d} de ${r.negocios}`}
              subtitulo={`${r.porcentaje_activos}% con ventas en 7 días`}
              icono={Store}
              gradiente="from-violet-500/20 to-violet-500/5"
              borde="border-violet-500/30"
              colorTexto="text-violet-300"
            />
          </div>

          {/* Desglose de Pagos y Parque de Suscripciones */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Medios de Pago */}
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="size-4 text-emerald-400" />
                  Volumen por Medio de Cobro
                </h3>
                <span className="text-xs text-slate-400">Total histórico</span>
              </div>
              <div className="space-y-3">
                {Object.entries(r.desglose_pagos).length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">Sin ventas registradas aún</p>
                ) : (
                  Object.entries(r.desglose_pagos).map(([metodo, data]) => {
                    const porcentaje = r.monto_total ? Math.round((data.monto / r.monto_total) * 100) : 0;
                    return (
                      <div key={metodo} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="capitalize text-slate-300">{metodo.replace("_", " ")}</span>
                          <span className="text-emerald-300">
                            {formatARS(data.monto)} ({data.cantidad} u. · {porcentaje}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                            style={{ width: `${Math.max(4, porcentaje)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Parque de Suscripciones */}
            <div className="panel p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="size-4 text-cyan-400" />
                  Estado del Parque de Negocios
                </h3>
                <span className="text-xs text-slate-400">{r.negocios} comercios</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
                  <p className="text-[11px] font-semibold uppercase text-cyan-300 flex items-center gap-1">
                    <Sparkles className="size-3" /> En Prueba (7d)
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{r.desglose_suscripciones.prueba}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                  <p className="text-[11px] font-semibold uppercase text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Suscripción Activa
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{r.desglose_suscripciones.activa}</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-[11px] font-semibold uppercase text-amber-300 flex items-center gap-1">
                    <PauseCircle className="size-3" /> Pausados
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{r.desglose_suscripciones.pausada}</p>
                </div>
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                  <p className="text-[11px] font-semibold uppercase text-red-300 flex items-center gap-1">
                    <XCircle className="size-3" /> Vencidos
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">{r.desglose_suscripciones.vencida}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 pt-1">
                Nuevos comercios sumados en los últimos 7 días:{" "}
                <strong className="text-emerald-400">+{r.nuevos_7d}</strong>
              </p>
            </div>
          </div>

          {/* Gráficos de actividad de 30 días */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Barras
              titulo="Ventas Diarias en la Plataforma (Últimos 30 días)"
              datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.ventas) }))}
              fmt={(n) => `${n} ventas`}
            />
            <Barras
              titulo="Nuevos Comercios Registrados por Día (Últimos 30 días)"
              datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.nuevos_negocios) }))}
              fmt={(n) => `${n} nuevos`}
            />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 2: COMERCIOS & PLANES (TENANTS)                 */}
      {/* ======================================================== */}
      {activeTab === "tenants" && (
        <div className="space-y-4">
          {/* Controles de Búsqueda y Filtros */}
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Gestión de Comercios & Planes ({tenantsFiltrados.length})
              </h3>
              <p className="text-xs text-slate-400">
                Podés pausar el acceso, sumar o restar días libremente, o alternar planes a cualquier comercio.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
                <Search className="size-3.5 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar comercio o email..."
                  className="w-48 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                />
              </div>

              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
              >
                <option value="todos">Todos los estados</option>
                <option value="prueba">En prueba gratis</option>
                <option value="activa">Suscripción activa</option>
                <option value="pausada">Pausados</option>
                <option value="vencida">Vencidos</option>
              </select>
            </div>
          </div>

          {/* Tabla de Comercios */}
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">Comercio / Dueño</th>
                  <th>Alta</th>
                  <th>Suscripción</th>
                  <th>Vencimiento</th>
                  <th className="text-right">Productos</th>
                  <th className="text-right">Ventas</th>
                  <th className="text-right">Facturación</th>
                  <th className="px-4 text-right">Acciones SuperAdmin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tenantsFiltrados.map((t) => {
                  const vendioReciente =
                    t.ultima_venta && ahora - new Date(t.ultima_venta).getTime() < 7 * 86400_000;
                  const estadoSub = t.suscripcion_estado ?? "prueba";
                  const estaPausada = estadoSub === "pausada";
                  const customVal = diasCustomPorTenant[t.id] ?? "";
                  const isExpanded = expandedTenantId === t.id;

                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Nombre y Dueño */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-2.5 rounded-full shrink-0",
                              !t.activo
                                ? "bg-red-500 ring-2 ring-red-500/20"
                                : vendioReciente
                                ? "bg-emerald-400 ring-2 ring-emerald-400/20"
                                : "bg-slate-600"
                            )}
                            title={
                              !t.activo
                                ? "Comercio deshabilitado por SuperAdmin"
                                : vendioReciente
                                ? "Vendió en los últimos 7 días"
                                : "Sin ventas recientes"
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setExpandedTenantId(isExpanded ? null : t.id)}
                            className="font-semibold text-white hover:text-emerald-400 flex items-center gap-1.5 transition-colors text-left"
                          >
                            <span>{t.nombre}</span>
                            {isExpanded ? (
                              <ChevronUp className="size-3 text-slate-400" />
                            ) : (
                              <ChevronDown className="size-3 text-slate-400" />
                            )}
                          </button>
                        </div>
                        <p className="ml-4 text-[11px] text-slate-400">
                          {t.owner_email || "Sin email"}
                          {t.owner_nombre ? ` (${t.owner_nombre})` : ""} · {t.usuarios} usuario(s)
                        </p>

                        {/* Vista expandida con detalles y equipo */}
                        {isExpanded && (
                          <div className="mt-3 ml-4 p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
                            <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                              Equipo de Trabajo ({t.miembros?.length ?? 0}):
                            </p>
                            <div className="space-y-1">
                              {t.miembros?.map((m) => (
                                <div key={m.id} className="flex items-center justify-between text-xs text-slate-400">
                                  <span>
                                    {m.nombre || "Usuario"} ({m.email})
                                  </span>
                                  <span className="font-mono text-[10px] uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    {m.rol}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">
                                Estado de acceso general del local:
                              </span>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleToggleTenantActivo(t)}
                                className={cn(
                                  "text-[11px] font-bold px-2 py-0.5 rounded transition",
                                  t.activo
                                    ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                    : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                                )}
                              >
                                {t.activo ? "Pausar Comercio Completo" : "Reactivar Comercio"}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Fecha de alta */}
                      <td className="text-xs text-slate-400">{fecha(t.created_at)}</td>

                      {/* Estado Suscripción */}
                      <td>
                        <BadgeSuscripcion tenant={t} />
                        <p className="text-[10px] text-slate-500 mt-0.5">{t.suscripcion_plan}</p>
                      </td>

                      {/* Vencimiento */}
                      <td className="text-xs text-slate-300">{fecha(t.suscripcion_fecha_fin)}</td>

                      {/* Productos */}
                      <td className="text-right text-xs text-slate-300">{t.productos}</td>

                      {/* Ventas */}
                      <td className="text-right text-xs text-slate-300">{t.ventas}</td>

                      {/* Monto */}
                      <td className="text-right text-xs font-semibold text-emerald-400">
                        {formatARS(Number(t.monto))}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* Sumar 7 o 30 días */}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleAgregarDias(t, 7)}
                            title="Sumar 7 días"
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-bold text-cyan-300 transition hover:bg-cyan-500/20 disabled:opacity-50"
                          >
                            +7d
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleAgregarDias(t, 30)}
                            title="Sumar 30 días"
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            +30d
                          </button>

                          {/* Entrada manual de días */}
                          <div className="flex items-center rounded-lg border border-white/10 bg-black/50 px-1.5 py-0.5">
                            <input
                              type="number"
                              value={customVal}
                              onChange={(e) =>
                                setDiasCustomPorTenant((prev) => ({
                                  ...prev,
                                  [t.id]: e.target.value,
                                }))
                              }
                              placeholder="±días"
                              className="w-12 bg-transparent text-center text-[11px] text-white outline-none placeholder:text-slate-500"
                            />
                            <button
                              type="button"
                              disabled={pending || !customVal.trim()}
                              onClick={() => handleAgregarDias(t, Number(customVal))}
                              title="Aplicar días (positivo suma, negativo resta)"
                              className="rounded p-1 text-sky-400 hover:bg-white/10 disabled:opacity-40"
                            >
                              <CalendarPlus className="size-3.5" />
                            </button>
                          </div>

                          {/* Alternar estado de suscripción */}
                          {estaPausada ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => handleCambiarEstado(t, "activa")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                            >
                              <PlayCircle className="size-3.5" />
                              Activar
                            </button>
                          ) : (
                            <>
                              {estadoSub !== "activa" && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => handleCambiarEstado(t, "activa")}
                                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="size-3" />
                                  Activar
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => handleCambiarEstado(t, "pausada")}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                <PauseCircle className="size-3" />
                                Pausar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!tenantsFiltrados.length && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No se encontraron comercios con el filtro aplicado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 3: USUARIOS DE PLATAFORMA                       */}
      {/* ======================================================== */}
      {activeTab === "usuarios" && (
        <div className="space-y-4">
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h3 className="text-sm font-bold text-white">
                Base Global de Usuarios ({usuariosFiltrados.length})
              </h3>
              <p className="text-xs text-slate-400">
                Usuarios de todos los comercios. Podés nombrar o revocar SuperAdministradores de la plataforma.
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
              <Search className="size-3.5 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por usuario, email o negocio..."
                className="w-56 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                <tr>
                  <th className="px-4 py-3">Nombre & Correo</th>
                  <th>Comercio Asociado</th>
                  <th>Rol en el Comercio</th>
                  <th>Estado</th>
                  <th>Fecha de Registro</th>
                  <th>Privilegios de Plataforma</th>
                  <th className="px-4 text-right">Acción SuperAdmin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {usuariosFiltrados.map((u) => {
                  const isMainAdmin = u.email?.toLowerCase() === "tomasklaus17@gmail.com";

                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{u.nombre || "Usuario"}</p>
                        <p className="text-xs text-slate-400">{u.email || "Sin email"}</p>
                      </td>
                      <td className="text-xs text-slate-300 font-medium">{u.tenant_nombre}</td>
                      <td>
                        <span className="text-[11px] font-mono uppercase bg-white/5 px-2 py-0.5 rounded text-slate-300 border border-white/10">
                          {u.rol}
                        </span>
                      </td>
                      <td>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                            u.activo
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                              : "bg-red-500/10 text-red-300 border border-red-500/20"
                          )}
                        >
                          {u.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="text-xs text-slate-400">{fecha(u.created_at)}</td>
                      <td>
                        {u.es_superadmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                            <ShieldCheck className="size-3" />
                            {isMainAdmin ? "SuperAdmin Principal" : "SuperAdmin"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Usuario estándar</span>
                        )}
                      </td>
                      <td className="px-4 text-right">
                        {isMainAdmin ? (
                          <span className="text-[11px] text-slate-500 italic">Dueño de plataforma</span>
                        ) : (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleToggleSuperAdmin(u)}
                            className={cn(
                              "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition border disabled:opacity-50",
                              u.es_superadmin
                                ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                            )}
                          >
                            {u.es_superadmin ? (
                              <>
                                <UserX className="size-3" /> Revocar Admin
                              </>
                            ) : (
                              <>
                                <UserCheck className="size-3" /> Hacer Admin
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* PESTAÑA 4: SALUD & PASARELAS                            */}
      {/* ======================================================== */}
      {activeTab === "salud" && (
        <div className="space-y-4">
          <div className="panel p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="size-4 text-emerald-400" />
              Estado de Servicios & Pasarelas
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Base de Datos Supabase */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                    Base de Datos Supabase
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="size-3" /> Conectada
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono break-all">{salud.supabaseUrl}</p>
                <p className="text-[11px] text-slate-500">
                  Total de productos en catálogos de toda la plataforma:{" "}
                  <strong className="text-white">{salud.totalProductosPlataforma}</strong>
                </p>
              </div>

              {/* Mercado Pago */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                    Mercado Pago (Suscripciones)
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border",
                      salud.mercadoPagoConfigurado
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    )}
                  >
                    {salud.mercadoPagoConfigurado ? "Configurado" : "Pendiente"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {salud.mercadoPagoConfigurado
                    ? "Tokens de acceso y webhook configurados en .env"
                    : "No se detectaron tokens de producción"}
                </p>
              </div>

              {/* PayPal */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                    PayPal (Suscripciones Internacionales)
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border",
                      salud.paypalConfigurado
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    )}
                  >
                    {salud.paypalConfigurado ? "Configurado (Sandbox)" : "Pendiente"}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {salud.paypalConfigurado
                    ? "Client ID y Plan ID de PayPal activos"
                    : "No configurado"}
                </p>
              </div>

              {/* Soporte WhatsApp */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs uppercase tracking-wider text-slate-300">
                    Soporte Comercial WhatsApp
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border",
                      salud.whatsappConfigurado
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                        : "text-slate-400 bg-slate-500/10 border-slate-500/20"
                    )}
                  >
                    {salud.whatsappConfigurado ? "Habilitado" : "Deshabilitado"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  {process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || "Sin número definido"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
