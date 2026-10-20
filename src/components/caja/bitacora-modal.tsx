"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, Boxes, ChevronDown, ClipboardList, Loader2, PackageCheck,
  RefreshCw, Search, Store, UserRound, X,
} from "lucide-react";
import { anularVenta, obtenerBitacora } from "@/actions/caja";
import {
  ETIQUETA_MOV, diaAR, esIngresoCaja, etiquetaDia, etiquetaMotivo, fechaHoraAR, soloHoraAR,
  unidadesEntrada, unidadesSalida,
} from "@/lib/bitacora";
import { cn, formatARS, formatCantidad } from "@/lib/utils";
import type {
  BitacoraData, IngresoStockRow, ItemMovimiento, MovimientoBitacora, RangoBitacora,
} from "@/types";

const RANGOS: { id: RangoBitacora; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "mes", label: "Este mes" },
  { id: "todo", label: "Todo" },
];

type FiltroTipo = "todos" | "egresos" | "ingresos" | "stock";
type FiltroStock = "todos" | "con" | "sin";

const ETIQUETA_TIPO: Record<FiltroTipo, string> = {
  todos: "Todos",
  egresos: "Egresos",
  ingresos: "Ingresos",
  stock: "Sólo stock",
};

/** Minutos entre un egreso y un ingreso de mercadería para sugerir el vínculo. */
const VENTANA_SUGERENCIA_MIN = 120;
const esStock = (m: MovimientoBitacora) => m.tipo === "nota_stock";
const esEgreso = (m: MovimientoBitacora) => m.tipo.startsWith("egreso");
const esIngreso = (m: MovimientoBitacora) => m.tipo.startsWith("ingreso");


/** Coincidencias de un egreso con los ingresos de mercadería del mismo turno. */
function ingresosCercanos(m: MovimientoBitacora, ingresos: IngresoStockRow[]) {
  const t0 = new Date(m.created_at).getTime();
  return ingresos
    .map((i) => ({ ...i, deltaMin: Math.round((new Date(i.created_at).getTime() - t0) / 60000) }))
    .filter((i) => Math.abs(i.deltaMin) <= VENTANA_SUGERENCIA_MIN)
    .sort((a, b) => Math.abs(a.deltaMin) - Math.abs(b.deltaMin));
}

/** Texto corto de una coincidencia: "+12 u. · 40 min antes · Juan". */
function textoCercano(i: IngresoStockRow & { deltaMin: number }) {
  const u = unidadesEntrada(i.items);
  const cuando = i.deltaMin === 0 ? "mismo minuto" : i.deltaMin > 0 ? `+${i.deltaMin} min` : `${-i.deltaMin} min antes`;
  return `+${u} u. · ${cuando} · ${i.usuario}`;
}

export function BitacoraModal({ inicial, onClose }: { inicial: BitacoraData | null; onClose: () => void }) {
  const [data, setData] = useState<BitacoraData | null>(inicial);
  const [rango, setRango] = useState<RangoBitacora>(inicial?.rango ?? "hoy");
  const [tipo, setTipo] = useState<FiltroTipo>("todos");
  const [operador, setOperador] = useState("");
  const [stockFiltro, setStockFiltro] = useState<FiltroStock>("todos");
  const [q, setQ] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [pending, start] = useTransition();
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const recargar = (nuevoRango: RangoBitacora, nuevoOperador: string) => {
    setCargando(true);
    start(async () => {
      const r = await obtenerBitacora(nuevoRango, nuevoOperador || null);
      if (r) setData(r);
      setCargando(false);
    });
  };

  const cambiarRango = (r: RangoBitacora) => {
    setRango(r);
    recargar(r, operador);
  };

  const toggle = (id: string) =>
    setAbiertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.movimientos ?? []).filter((m) => {
      if (tipo === "egresos" && !esEgreso(m)) return false;
      if (tipo === "ingresos" && !esIngreso(m)) return false;
      if (tipo === "stock" && !esStock(m)) return false;
      if (stockFiltro === "con" && !m.stock_involucrado) return false;
      if (stockFiltro === "sin" && (m.stock_involucrado || !esEgreso(m))) return false;
      if (!term) return true;
      const enItems = (m.items ?? []).some((i) => i.nombre.toLowerCase().includes(term));
      return (
        (m.descripcion ?? "").toLowerCase().includes(term) ||
        (m.detalle ?? "").toLowerCase().includes(term) ||
        m.usuario.toLowerCase().includes(term) ||
        ETIQUETA_MOV[m.tipo].toLowerCase().includes(term) ||
        enItems
      );
    });
  }, [data, tipo, stockFiltro, q]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, MovimientoBitacora[]>();
    for (const m of filtrados) {
      const d = diaAR(m.created_at);
      const lista = mapa.get(d) ?? [];
      lista.push(m);
      mapa.set(d, lista);
    }
    return [...mapa.entries()]
      .map(([dia, lista]) => [dia, lista.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))] as const)
      .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtrados]);

  const totalesFiltrados = useMemo(() => filtrados.reduce(
    (acc, m) => {
      if (esIngreso(m)) acc.ingresos += Number(m.monto);
      if (esEgreso(m)) {
        acc.egresos += Number(m.monto);
        if (m.stock_involucrado) acc.conStock += Number(m.monto);
      }
      return acc;
    },
    { ingresos: 0, egresos: 0, conStock: 0 },
  ), [filtrados]);

  const turnosDelDia = useMemo(() => {
    const mapa = new Map<string, BitacoraData["turnos"][number]>();
    for (const t of data?.turnos ?? []) mapa.set(t.id, t);
    return mapa;
  }, [data]);

  const confirmarAnulacion = () => {
    if (!anulando) return;
    const venta = anulando;
    start(async () => {
      const r = await anularVenta(venta, motivoAnulacion);
      if (!r.ok) {
        setAnulando(null);
        alert(r.error ?? "No se pudo anular la venta");
        return;
      }
      setAnulando(null);
      setMotivoAnulacion("");
      recargar(rango, operador);
    });
  };

  const select = "rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400";
  const chip = "rounded-xl bg-white/5 px-3 py-1.5";
  const chipTitulo = "text-[10px] uppercase tracking-wider text-slate-500";


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0e1426] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold">Bitácora de movimientos</h2>
              <p className="text-[11px] text-slate-500">Quién, cuándo, qué se movió y si el egreso vino con mercadería</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => recargar(rango, operador)}
              disabled={cargando}
              className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10 disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={cn("size-4", cargando && "animate-spin")} />
            </button>
            <button onClick={onClose} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" title="Cerrar">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            {RANGOS.map((r) => (
              <button
                key={r.id}
                onClick={() => cambiarRango(r.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs transition",
                  rango === r.id ? "bg-emerald-500 font-semibold text-slate-950" : "text-slate-400 hover:text-white",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <select value={tipo} onChange={(e) => setTipo(e.target.value as FiltroTipo)} className={select}>
            {(Object.keys(ETIQUETA_TIPO) as FiltroTipo[]).map((t) => (
              <option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>
            ))}
          </select>

          <select
            value={stockFiltro}
            onChange={(e) => setStockFiltro(e.target.value as FiltroStock)}
            className={select}
            title="Egresos vinculados (o no) con un ingreso de stock"
          >
            <option value="todos">Stock: todos</option>
            <option value="con">Sólo con ingreso de stock</option>
            <option value="sin">Egresos sin ingreso de stock</option>
          </select>

          <select
            value={operador}
            onChange={(e) => { setOperador(e.target.value); recargar(rango, e.target.value); }}
            className={select}
            title="Operador"
          >
            <option value="">Todos los operadores</option>
            {(data?.operadores ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto, concepto u operador…"
              className={cn(select, "w-56 pl-7 sm:w-72")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-white/10 px-4 py-2.5 sm:grid-cols-4">
          <div className={chip}>
            <p className={chipTitulo}>Ingresos</p>
            <p className="text-sm font-bold text-emerald-300">{formatARS(totalesFiltrados.ingresos)}</p>
          </div>
          <div className={chip}>
            <p className={chipTitulo}>Egresos</p>
            <p className="text-sm font-bold text-red-300">{formatARS(totalesFiltrados.egresos)}</p>
          </div>
          <div className={chip}>
            <p className={chipTitulo}>Egresos con stock</p>
            <p className="text-sm font-bold text-sky-300">{formatARS(totalesFiltrados.conStock)}</p>
          </div>
          <div className={chip}>
            <p className={chipTitulo}>Movimientos</p>
            <p className="text-sm font-bold">{filtrados.length}</p>
          </div>
        </div>

        {data && !data.migrado && (
          <p className="border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-[11px] text-red-200">
            No se pudieron leer los movimientos de la bitácora.
            {data.error ? <> Error de la base: <b>{data.error}</b></> : null}
          </p>
        )}


        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {!porDia.length && (
            <p className="py-10 text-center text-sm text-slate-500">
              {cargando
                ? "Cargando…"
                : data
                  ? "No hay movimientos con estos filtros."
                  : "No se pudo cargar la bitácora. Verificá tu sesión (la bitácora es sólo para dueño y administrador)."}
            </p>
          )}

          {porDia.map(([dia, lista]) => {
            const ingresosDia = lista.filter(esIngreso).reduce((a, m) => a + Number(m.monto), 0);
            const egresosDia = lista.filter(esEgreso).reduce((a, m) => a + Number(m.monto), 0);
            return (
              <section key={dia} className="mb-4">
                <header className="sticky top-0 z-10 mb-1.5 flex flex-wrap items-center gap-3 rounded-lg bg-[#0e1426]/95 px-2 py-1.5 text-xs backdrop-blur">
                  <span className="font-bold text-white">{etiquetaDia(lista[0].created_at)}</span>
                  <span className="hidden text-slate-500 sm:inline">{dia}</span>
                  <span className="text-emerald-300">+{formatARS(ingresosDia)}</span>
                  <span className="text-red-300">−{formatARS(egresosDia)}</span>
                  <span className="ml-auto text-slate-500">{lista.length} mov.</span>
                </header>

                <ol className="space-y-1">
                  {lista.map((m) => (
                    <FilaMovimiento
                      key={m.id}
                      m={m}
                      abierto={abiertos.has(m.id)}
                      onToggle={() => toggle(m.id)}
                      turno={turnosDelDia.get(m.turno_id)}
                      ingresos={data?.ingresos ?? []}
                      anulando={anulando}
                      motivoAnulacion={motivoAnulacion}
                      pending={pending}
                      setMotivoAnulacion={setMotivoAnulacion}
                      iniciarAnulacion={setAnulando}
                      confirmarAnulacion={confirmarAnulacion}
                      select={select}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}


/** Una fila de la bitácora, con el detalle de lo movido y el vínculo con stock. */
function FilaMovimiento({
  m, abierto, onToggle, turno, ingresos, anulando, motivoAnulacion, pending,
  setMotivoAnulacion, iniciarAnulacion, confirmarAnulacion, select,
}: {
  m: MovimientoBitacora;
  abierto: boolean;
  onToggle: () => void;
  turno?: BitacoraData["turnos"][number];
  ingresos: IngresoStockRow[];
  anulando: string | null;
  motivoAnulacion: string;
  pending: boolean;
  setMotivoAnulacion: (v: string) => void;
  iniciarAnulacion: (ventaId: string) => void;
  confirmarAnulacion: () => void;
  select: string;
}) {
  const ingreso = esIngresoCaja(m.tipo);
  const egreso = esEgreso(m);
  const cercanos = egreso && !m.stock_involucrado ? ingresosCercanos(m, ingresos) : [];
  const conDetalle = Boolean(m.items?.length) || Boolean(m.detalle) || Boolean(m.referencia)
    || cercanos.length > 0 || egreso || esStock(m) || Boolean(m.venta_id);

  return (
    <li className="rounded-xl border border-white/5 bg-white/[0.02]">
      <button
        onClick={onToggle}
        className={cn("flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left",
          conDetalle ? "hover:bg-white/[0.04]" : "cursor-default")}
      >
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full",
          ingreso ? "bg-emerald-400/10" : esStock(m) ? "bg-sky-400/10" : "bg-red-400/10")}>
          {ingreso ? <ArrowUpCircle className="size-4 text-emerald-400" />
            : esStock(m) ? <Boxes className="size-4 text-sky-300" />
              : <ArrowDownCircle className="size-4 text-red-400" />}
        </span>
        <span suppressHydrationWarning className="w-11 shrink-0 font-mono text-[11px] text-slate-500">
          {soloHoraAR(m.created_at)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm">{m.descripcion ?? ETIQUETA_MOV[m.tipo]}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
              {ETIQUETA_MOV[m.tipo]}
            </span>
            {m.stock_involucrado && (egreso || esStock(m)) && (
              <span className="inline-flex items-center gap-1 rounded bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                <PackageCheck className="size-3" /> con ingreso de stock
              </span>
            )}
            {egreso && !m.stock_involucrado && (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                sin stock asociado
              </span>
            )}
            {m.forma_pago && m.forma_pago !== "efectivo" && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{m.forma_pago}</span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{m.usuario}</span>
            {turno && (
              <span className="inline-flex items-center gap-1">
                <Store className="size-3" />turno {soloHoraAR(turno.abierto_at)}
                {turno.estado === "cerrado" && turno.diferencia !== null && turno.diferencia !== 0 && (
                  <b className={turno.diferencia > 0 ? "text-sky-300" : "text-red-300"}>
                    (dif. {formatARS(turno.diferencia)})
                  </b>
                )}
              </span>
            )}
            {m.items?.length ? (
              <span>{m.items.length} elemento{m.items.length > 1 ? "s" : ""} movido{m.items.length > 1 ? "s" : ""}</span>
            ) : null}
          </span>
        </span>
        {esStock(m) ? (
          <span className="shrink-0 text-[11px] text-slate-500">sin dinero</span>
        ) : (
          <span className={cn("shrink-0 font-semibold", ingreso ? "text-emerald-400" : "text-red-400")}>
            {ingreso ? "+" : "−"}{formatARS(Number(m.monto))}
          </span>
        )}
        {conDetalle && (
          <ChevronDown className={cn("size-4 shrink-0 text-slate-500 transition", abierto && "rotate-180")} />
        )}
      </button>


      {abierto && (
        <div className="space-y-2 border-t border-white/5 px-3 py-2.5 text-xs">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-400">
            <span>Fecha y hora: <b className="text-slate-200">{fechaHoraAR(m.created_at)}</b></span>
            <span>Operador: <b className="text-slate-200">{m.usuario}</b></span>
            {m.referencia && <span>Referencia: <b className="font-mono text-slate-300">{m.referencia}</b></span>}
          </div>
          {m.detalle && (
            <p className="text-slate-300"><span className="text-slate-500">Especificación: </span>{m.detalle}</p>
          )}

          <ItemsMovidos items={m.items} />

          {m.stock_involucrado && (egreso || esStock(m)) && (
            <p className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400/10 px-2 py-1 text-[11px] text-sky-200">
              <PackageCheck className="size-3.5" /> Este movimiento estuvo vinculado con un ingreso de stock
            </p>
          )}

          {cercanos.length > 0 && (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2">
              <p className="text-[11px] text-amber-200/90">
                El dinero salió sin mercadería registrada. Ingresos de stock cercanos en el mismo turno:
              </p>
              <div className="mt-1 space-y-0.5">
                {cercanos.slice(0, 4).map((i) => (
                  <p key={i.movimiento_id} className="text-[11px] text-slate-300">
                    {soloHoraAR(i.created_at)} · {textoCercano(i)} — {i.descripcion}
                  </p>
                ))}
              </div>
            </div>
          )}

          {m.venta_id && ingreso && (
            anulando === m.venta_id ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <input
                  autoFocus
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  placeholder="Motivo de la anulación"
                  className={select}
                />
                <button onClick={confirmarAnulacion} disabled={pending}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50">
                  {pending && <Loader2 className="size-3 animate-spin" />} Confirmar anulación
                </button>
                <button onClick={() => iniciarAnulacion("")}
                  className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => iniciarAnulacion(m.venta_id!)}
                className="rounded-lg border border-red-400/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/10">
                Anular venta (devuelve stock y reintegra el dinero)
              </button>
            )
          )}
        </div>
      )}
    </li>
  );
}

/** Tabla con los elementos movidos y su saldo. */
function ItemsMovidos({ items }: { items: ItemMovimiento[] | null | undefined }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-slate-500">Qué se movió</p>
      <table className="w-full max-w-md text-left text-[11px]">
        <thead className="text-slate-500">
          <tr>
            <th className="py-0.5 font-medium">Elemento</th>
            <th className="py-0.5 text-right font-medium">Cant.</th>
            <th className="py-0.5 pl-3 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={`${it.producto_id}-${idx}`} className="border-t border-white/5">
              <td className="py-0.5 text-slate-200">{it.nombre}</td>
              <td className={cn("py-0.5 text-right font-mono font-semibold",
                Number(it.cantidad) >= 0 ? "text-emerald-300" : "text-red-300")}>
                {Number(it.cantidad) > 0 ? "+" : ""}{formatCantidad(Number(it.cantidad))}
              </td>
              <td className="py-0.5 pl-3 text-slate-400">{etiquetaMotivo(it.motivo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[10px] text-slate-500">
        Entradas: +{formatCantidad(unidadesEntrada(items))} · Salidas: −{formatCantidad(unidadesSalida(items))}
      </p>
    </div>
  );
}

