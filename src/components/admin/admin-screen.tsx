import { cn, formatARS } from "@/lib/utils";
import type { AdminDia, AdminResumen, AdminTenant } from "@/actions/admin";

function Kpi({ t, v, sub, c }: { t: string; v: string; sub?: string; c: string }) {
  return (
    <div className={cn("rounded-2xl border bg-gradient-to-br p-5", c)}>
      <p className="text-xs uppercase tracking-wider opacity-70">{t}</p>
      <p className="mt-2 text-3xl font-bold">{v}</p>
      {sub && <p className="mt-1 text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function Barras({ titulo, datos, fmt }: { titulo: string; datos: { dia: string; v: number }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.v));
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold">{titulo}</h3>
      <div className="flex h-40 items-end gap-1">
        {datos.map((d) => (
          <div key={d.dia} className="group flex h-full flex-1 flex-col justify-end" title={`${d.dia}: ${fmt(d.v)}`}>
            <div className="w-full rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300 transition group-hover:brightness-125"
              style={{ height: `${Math.max(2, (d.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{datos[0]?.dia.slice(5)}</span><span>{datos.at(-1)?.dia.slice(5)}</span>
      </div>
    </div>
  );
}

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }) : "—";

export function AdminScreen({ resumen: r, tenants, actividad }: { resumen: AdminResumen; tenants: AdminTenant[]; actividad: AdminDia[] }) {
  const ahora = Date.now();
  return (
    <div className="scroll-thin flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi t="Negocios" v={String(r.negocios)} sub={`+${r.nuevos_7d} en 7 días`} c="from-sky-500/25 to-sky-500/5 border-sky-400/30 text-sky-300" />
        <Kpi t="Usuarios" v={String(r.usuarios)} c="from-violet-500/25 to-violet-500/5 border-violet-400/30 text-violet-300" />
        <Kpi t="Negocios activos (7d)" v={String(r.activos_7d)} sub={r.negocios ? `${Math.round((r.activos_7d / r.negocios) * 100)}% del total` : undefined} c="from-emerald-500/25 to-emerald-500/5 border-emerald-400/30 text-emerald-300" />
        <Kpi t="Ventas (30d)" v={String(r.ventas_30d)} sub={formatARS(Number(r.monto_30d))} c="from-amber-500/25 to-amber-500/5 border-amber-400/30 text-amber-300" />
      </div>
      <p className="text-xs text-slate-500">
        Histórico: {r.ventas_total} ventas procesadas por {formatARS(Number(r.monto_total))}.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Barras titulo="Ventas por día en la plataforma (30d)" datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.ventas) }))} fmt={(n) => `${n} ventas`} />
        <Barras titulo="Nuevos negocios por día (30d)" datos={actividad.map((d) => ({ dia: d.dia, v: Number(d.nuevos_negocios) }))} fmt={(n) => `${n} nuevos`} />
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Negocio</th><th>Alta</th><th className="text-right">Usuarios</th>
              <th className="text-right">Productos</th><th className="text-right">Ventas</th>
              <th className="text-right">Monto</th><th className="px-4 text-right">Última venta</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => {
              const activo = t.ultima_venta && ahora - new Date(t.ultima_venta).getTime() < 7 * 86400_000;
              return (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2.5 font-medium">
                    <span className={cn("mr-2 inline-block size-2 rounded-full", activo ? "bg-emerald-400" : "bg-slate-600")} />{t.nombre}
                  </td>
                  <td className="text-slate-400">{fecha(t.created_at)}</td>
                  <td className="text-right">{t.usuarios}</td>
                  <td className="text-right">{t.productos}</td>
                  <td className="text-right">{t.ventas}</td>
                  <td className="text-right font-medium text-emerald-400">{formatARS(Number(t.monto))}</td>
                  <td className="px-4 text-right text-slate-400">{fecha(t.ultima_venta)}</td>
                </tr>
              );
            })}
            {!tenants.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Sin negocios</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
