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
} from "lucide-react";
import { toast } from "sonner";
import {
  adminAgregarDiasSuscripcion,
  adminCambiarEstadoSuscripcion,
  type AdminDia,
  type AdminResumen,
  type AdminTenant,
} from "@/actions/admin";
import { cn, formatARS } from "@/lib/utils";

function Kpi({ t, v, sub, c }: { t: string; v: string; sub?: string; c: string }) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-5", c)}>
      <p className="text-xs uppercase tracking-wider opacity-70">{t}</p>
      <p className="mt-2 text-3xl font-bold">{v}</p>
      {sub && <p className="mt-1 text-xs opacity-60">{sub}</p>}
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
      <h3 className="mb-4 text-sm font-semibold">{titulo}</h3>
      <div className="flex h-40 items-end gap-1">
        {datos.map((d) => (
          <div
            key={d.dia}
            className="group flex h-full flex-1 flex-col justify-end"
            title={`${d.dia}: ${fmt(d.v)}`}
          >
            <div
              className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300 transition group-hover:brightness-125"
              style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{datos[0]?.dia.slice(5)}</span>
        <span>{datos.at(-1)?.dia.slice(5)}</span>
      </div>
    </div>
  );
}

const fecha = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: "America/Argentina/Buenos_Aires",
      })
    : "—";

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
    case "pendiente":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
          <Clock className="size-3" />
          Pendiente
        </span>
      );
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
  actividad,
}: {
  resumen: AdminResumen;
  tenants: AdminTenant[];
  actividad: AdminDia[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("todos");
  const [diasCustomPorTenant, setDiasCustomPorTenant] = useState<Record<string, string>>({});

  const ahora = Date.now();

  const handleAgregarDias = (tenant: AdminTenant, dias: number) => {
    if (!Number.isFinite(dias) || dias === 0) {
      toast.error("Ingresá una cantidad de días válida (ej: 7, 15, 30 o -5)");
      return;
    }
    startTransition(async () => {
      const res = await adminAgregarDiasSuscripcion(tenant.id, dias);
      if (!res.ok) {
        toast.error(res.error || "No se pudieron modificar los días");
        return;
      }
      toast.success(
        `${dias > 0 ? `+${dias}` : dias} días aplicados a "${tenant.nombre}" (vence ${fecha(res.data?.fecha_fin)})`,
      );
      setDiasCustomPorTenant((prev) => ({ ...prev, [tenant.id]: "" }));
      router.refresh();
    });
  };

  const handleCambiarEstado = (
    tenant: AdminTenant,
    estado: "prueba" | "activa" | "pausada" | "cancelada",
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

  const tenantsFiltrados = tenants.filter((t) => {
    const q = busqueda.trim().toLowerCase();
    const coincideTexto =
      !q ||
      t.nombre.toLowerCase().includes(q) ||
      (t.owner_email ?? "").toLowerCase().includes(q);
    if (!coincideTexto) return false;
    if (filtroEstado === "todos") return true;
    const est = t.suscripcion_estado ?? "prueba";
    const vencida = (est === "prueba" || est === "activa") && (t.dias_restantes ?? 7) < 0;
    if (filtroEstado === "vencida") return vencida;
    return est === filtroEstado && !vencida;
  });

  return (
    <div className="scroll-thin flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          t="Negocios"
          v={String(r.negocios)}
          sub={`+${r.nuevos_7d} en 7 días`}
          c="from-sky-500/25 to-sky-500/5 border-sky-400/30 text-sky-300"
        />
        <Kpi
          t="Usuarios"
          v={String(r.usuarios)}
          c="from-violet-500/25 to-violet-500/5 border-violet-400/30 text-violet-300"
        />
        <Kpi
          t="Negocios activos (7d)"
          v={String(r.activos_7d)}
          sub={r.negocios ? `${Math.round((r.activos_7d / r.negocios) * 100)}% del total` : undefined}
          c="from-emerald-500/25 to-emerald-500/5 border-emerald-400/30 text-emerald-300"
        />
        <Kpi
          t="Ventas (30d)"
          v={String(r.ventas_30d)}
          sub={formatARS(Number(r.monto_30d))}
          c="from-amber-500/25 to-amber-500/5 border-amber-400/30 text-amber-300"
        />
      </div>
      <p className="text-xs text-slate-500">
        Histórico: {r.ventas_total} ventas procesadas por {formatARS(Number(r.monto_total))}.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Barras
          titulo="Ventas por día en la plataforma (30d)"
          datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.ventas) }))}
          fmt={(n) => `${n} ventas`}
        />
        <Barras
          titulo="Nuevos negocios por día (30d)"
          datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.nuevos_negocios) }))}
          fmt={(n) => `${n} nuevos`}
        />
      </div>

      {/* Controles de búsqueda y filtro de suscripciones */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="text-sm font-bold text-white">
            Control de Negocios & Suscripciones ({tenantsFiltrados.length})
          </h3>
          <p className="text-xs text-slate-400">
            Los nuevos kioscos nacen con 7 días gratis. Desde acá podés pausar el acceso, activarlos manualmente o sumar/restar días.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5">
            <Search className="size-3.5 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar negocio o email..."
              className="w-44 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
            />
          </div>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
          >
            <option value="todos">Todos los estados</option>
            <option value="prueba">En prueba (7d)</option>
            <option value="activa">Suscripción activa</option>
            <option value="pausada">Pausados</option>
            <option value="vencida">Vencidos</option>
          </select>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Negocio / Dueño</th>
              <th>Alta</th>
              <th>Suscripción</th>
              <th>Vencimiento</th>
              <th className="text-right">Ventas</th>
              <th className="text-right">Monto</th>
              <th className="px-4 text-right">Control SuperAdmin (Días / Estado)</th>
            </tr>
          </thead>
          <tbody>
            {tenantsFiltrados.map((t) => {
              const activo =
                t.ultima_venta && ahora - new Date(t.ultima_venta).getTime() < 7 * 86400_000;
              const estadoSub = t.suscripcion_estado ?? "prueba";
              const estaPausada = estadoSub === "pausada";
              const customVal = diasCustomPorTenant[t.id] ?? "";

              return (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <span
                        className={cn(
                          "inline-block size-2 shrink-0 rounded-full",
                          activo ? "bg-emerald-400" : "bg-slate-600",
                        )}
                        title={activo ? "Vendió en los últimos 7 días" : "Sin ventas recientes"}
                      />
                      <span>{t.nombre}</span>
                    </div>
                    <p className="ml-4 text-[11px] text-slate-400">
                      {t.owner_email ?? `${t.usuarios} usuario(s)`} · {t.productos} prod.
                    </p>
                  </td>
                  <td className="text-xs text-slate-400">{fecha(t.created_at)}</td>
                  <td>
                    <BadgeSuscripcion tenant={t} />
                  </td>
                  <td className="text-xs text-slate-300">
                    {fecha(t.suscripcion_fecha_fin)}
                  </td>
                  <td className="text-right text-xs">{t.ventas}</td>
                  <td className="text-right text-xs font-medium text-emerald-400">
                    {formatARS(Number(t.monto))}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {/* Botones rápidos para sumar días */}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleAgregarDias(t, 7)}
                        title="Sumar 7 días gratis"
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

                      {/* Input libre para sumar o restar cualquier cantidad de días */}
                      <div className="flex items-center rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5">
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
                          className="w-14 bg-transparent text-center text-[11px] text-white outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          disabled={pending || !customVal.trim()}
                          onClick={() => handleAgregarDias(t, Number(customVal))}
                          title="Aplicar cantidad personalizada de días (positivo suma, negativo resta)"
                          className="rounded p-1 text-sky-400 hover:bg-white/10 disabled:opacity-40"
                        >
                          <CalendarPlus className="size-3.5" />
                        </button>
                      </div>

                      {/* Pausar / Reactivar */}
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
                              title="Marcar suscripción como Activa (30 días)"
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
                            title="Pausar suscripción (bloquea nuevas ventas hasta reactivar)"
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
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  Sin negocios para este filtro
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
