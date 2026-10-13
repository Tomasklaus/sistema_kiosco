"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, formatARS } from "@/lib/utils";
import type { ReporteData } from "@/types";
import type { RangoId } from "@/actions/reportes";

const RANGOS: { id: RangoId; label: string }[] = [
  { id: "hoy", label: "Hoy" }, { id: "ayer", label: "Ayer" },
  { id: "7d", label: "Últimos 7 días" }, { id: "mes", label: "Este Mes" },
];
const H_INI = 6, H_FIN = 23;

function Ranking({ titulo, filas, money }: { titulo: string; filas: [string, number][]; money?: boolean }) {
  const max = Math.max(1, ...filas.map((f) => f[1]));
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-sm font-semibold">{titulo}</h3>
      <ol className="space-y-2">
        {filas.map(([n, v], i) => (
          <li key={n} className="text-xs">
            <div className="mb-1 flex justify-between">
              <span><span className="mr-2 text-slate-500">{i + 1}</span>{n}</span>
              <b>{money ? formatARS(Math.round(v)) : v}</b>
            </div>
            <div className="h-1.5 rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300" style={{ width: `${(v / max) * 100}%` }} />
            </div>
          </li>
        ))}
        {!filas.length && <li className="py-4 text-center text-xs text-slate-500">Sin ventas en este período</li>}
      </ol>
    </div>
  );
}

export function ReportesScreen({ data, rango }: { data: ReporteData; rango: RangoId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const horas = data.horas.slice(H_INI, H_FIN + 1);
  const max = Math.max(1, ...horas);
  const pico = data.total > 0 ? H_INI + horas.indexOf(Math.max(...horas)) : null;

  const p = data.pagos;
  const pct = (v: number) => (data.total ? Math.round((v / data.total) * 100) : 0);
  const efe = pct(p.efectivo), digi = pct(p.mercadopago + p.tarjeta), cta = pct(p.cuenta_corriente);
  const donut = data.total
    ? `conic-gradient(#34d399 0 ${efe}%, #38bdf8 ${efe}% ${efe + digi}%, #a78bfa ${efe + digi}% 100%)`
    : "conic-gradient(#1e293b 0 100%)";

  return (
    <div className={cn("scroll-thin flex h-full flex-col gap-4 overflow-y-auto pr-1 transition", pending && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Ventas totales</p>
          <p className="glow-total text-4xl font-extrabold">{formatARS(data.total)}</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {RANGOS.map((r) => (
            <button key={r.id} onClick={() => start(() => router.push(`/reportes?r=${r.id}`))}
              className={cn("rounded-lg px-3 py-1.5 text-sm transition", rango === r.id ? "bg-emerald-500 font-semibold text-slate-950" : "text-slate-400 hover:text-white")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Ventas por hora</h3>
            {pico !== null && <span className="text-xs text-amber-300">🔥 Pico a las {pico}:00 hs</span>}
          </div>
          <div className="flex h-56 items-end gap-1.5">
            {horas.map((v, i) => (
              <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">{formatARS(v)}</span>
                <div className={cn("w-full rounded-t-md transition-all duration-500", v === max && v > 0 ? "bg-gradient-to-t from-amber-500 to-amber-300" : "bg-gradient-to-t from-emerald-600 to-emerald-300")}
                  style={{ height: `${Math.max(2, (v / max) * 85)}%` }} />
                <span className="text-[10px] text-slate-500">{H_INI + i}h</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel flex flex-col items-center p-5">
          <h3 className="mb-4 self-start text-sm font-semibold">Desglose de pagos</h3>
          <div className="relative size-40 rounded-full" style={{ background: donut }}>
            <div className="absolute inset-5 grid place-items-center rounded-full bg-[#10162a] text-center">
              <span className="text-2xl font-bold">{efe}%</span>
              <span className="-mt-3 text-[10px] text-slate-500">efectivo</span>
            </div>
          </div>
          <ul className="mt-4 w-full space-y-1.5 text-xs">
            {[["Efectivo", efe, "bg-emerald-400"], ["MercadoPago / Tarjeta", digi, "bg-sky-400"], ["Cta. Corriente", cta, "bg-violet-400"]].map(([n, v, c]) => (
              <li key={n as string} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><i className={cn("size-2.5 rounded-full", c as string)} />{n}</span><b>{v}%</b>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Ranking titulo="Top 10 más vendidos (unidades)" filas={data.topUnidades} />
        <Ranking titulo="Top 10 mayor rentabilidad ($)" filas={data.topRentabilidad} money />
      </div>
    </div>
  );
}
