"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, ClipboardList, Lock, MinusCircle, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { abrirTurno, cerrarTurno, registrarEgreso, registrarEgresoConStock } from "@/actions/caja";
import { BitacoraModal } from "@/components/caja/bitacora-modal";
import { MOTIVOS_STOCK } from "@/lib/bitacora";
import { puedeVerBitacora } from "@/lib/permisos";
import { cn, formatARS, parseNumero, parseNumeroPositivo } from "@/lib/utils";
import type { BitacoraData, CajaData, MovimientoCajaRow, RolUsuario } from "@/types";

const BILLETES = [20000, 10000, 2000, 1000, 500, 200, 100];
const esIngreso = (m: MovimientoCajaRow) => m.tipo.startsWith("ingreso");

export function CajaScreen({
  caja, rol = "cajero", bitacoraInicial = null,
}: {
  caja: CajaData | null;
  rol?: RolUsuario;
  bitacoraInicial?: BitacoraData | null;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const start = (fn: () => Promise<unknown>) => startT(async () => { await fn(); });
  const [panel, setPanel] = useState<"none" | "arqueo" | "gasto">("none");
  const [bitacora, setBitacora] = useState(false);
  const [conteo, setConteo] = useState<Record<number, string>>({});
  const [gasto, setGasto] = useState({
    concepto: "", monto: "", detalle: "", conStock: false, motivo: "compra_proveedor", referencia: "",
  });
  const [fondo, setFondo] = useState("");

  const verBitacora = puedeVerBitacora(rol);

  const movs = useMemo(() => caja?.movimientos ?? [], [caja]);
  const fondoInicial = caja?.turno.monto_inicial ?? 0;

  const k = useMemo(() => {
    // Las notas de stock (migración 0008) no mueven dinero: no entran en la caja.
    const caja = movs.filter((m) => m.tipo !== "nota_stock");
    const sum = (f: (m: MovimientoCajaRow) => boolean) => caja.filter(f).reduce((a, m) => a + Number(m.monto), 0);
    const efectivo = sum((m) => esIngreso(m) && m.metodo_pago === "efectivo");
    const digital = sum((m) => esIngreso(m) && m.metodo_pago !== "efectivo");
    const egresos = sum((m) => !esIngreso(m));
    return { efectivo, digital, egresos, esperado: fondoInicial + efectivo - egresos };
  }, [movs, fondoInicial]);

  const contado = BILLETES.reduce((a, b) => a + b * (parseNumeroPositivo(conteo[b] ?? "")), 0);
  const diff = contado - k.esperado;
  const input = "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

  if (!caja) {
    return (
      <div className="grid h-full place-items-center">
        <div className="panel w-full max-w-sm space-y-4 p-6 text-center">
          <Lock className="mx-auto size-10 text-emerald-400" />
          <h2 className="text-xl font-bold">Caja cerrada</h2>
          <input value={fondo} onChange={(e) => setFondo(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Fondo inicial (ej: 10000)" className={cn(input, "w-full text-center")} />
          <button disabled={pending}
            onClick={() => start(async () => {
              const r = await abrirTurno(parseNumeroPositivo(fondo));
              if (!r.ok) return toast.error(r.error);
              toast.success("Turno abierto"); router.refresh();
            })}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3 font-bold text-slate-950 disabled:opacity-50">
            Abrir turno
          </button>
        </div>
      </div>
    );
  }

  const registrarGasto = () => {
    const monto = parseNumero(gasto.monto);
    if (!gasto.concepto || monto === null || monto <= 0) return toast.error("Completá concepto y monto");
    if (gasto.conStock && !gasto.detalle) {
      return toast.error("Indicá qué mercadería ingresó (producto y cantidad) o desmarcá el ingreso de stock");
    }
    start(async () => {
      // Con ingreso de stock, el detalle queda además como línea de bitácora.
      const r = gasto.conStock
        ? await registrarEgresoConStock({
            monto,
            concepto: gasto.concepto,
            detalle: gasto.detalle,
            motivo: gasto.motivo,
            referencia: gasto.referencia || null,
          })
        : await registrarEgreso(monto, gasto.concepto, { detalle: gasto.detalle, referencia: gasto.referencia || null });
      if (!r.ok) return toast.error(r.error);
      toast.success(
        gasto.conStock
          ? "Gasto registrado y vinculado al ingreso de stock. Cargá los productos desde Inventario."
          : "Gasto registrado",
      );
      setGasto({ concepto: "", monto: "", detalle: "", conStock: false, motivo: "compra_proveedor", referencia: "" });
      setPanel("none");
      router.refresh();
    });
  };

  const cerrar = () => start(async () => {
    const r = await cerrarTurno(contado);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Turno cerrado. Diferencia: ${formatARS(r.data?.diferencia ?? 0)}`);
    setPanel("none"); setConteo({}); router.refresh();
  });

  const kpis = [
    { t: "Fondo Inicial", v: fondoInicial, c: "from-slate-500/25 to-slate-500/5 border-slate-400/20 text-slate-200" },
    { t: "Ventas Efectivo", v: k.efectivo, c: "from-emerald-500/25 to-emerald-500/5 border-emerald-400/30 text-emerald-300" },
    { t: "Ventas Digitales", v: k.digital, c: "from-sky-500/25 to-sky-500/5 border-sky-400/30 text-sky-300" },
    { t: "Egresos", v: k.egresos, c: "from-red-500/25 to-red-500/5 border-red-400/30 text-red-300" },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((x) => (
          <div key={x.t} className={cn("rounded-2xl border bg-gradient-to-br p-3.5 sm:p-5", x.c)}>
            <p className="text-[10px] sm:text-xs uppercase tracking-wider opacity-70 font-semibold">{x.t}</p>
            <p className="mt-1 sm:mt-2 text-xl sm:text-2xl font-bold truncate">{formatARS(x.v)}</p>
          </div>
        ))}
      </div>

      <div className="panel flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-emerald-400/30 p-4 sm:px-6 sm:py-4">
        <div>
          <p className="text-[10px] sm:text-xs uppercase tracking-wider text-slate-400 font-semibold">Efectivo esperado en caja</p>
          <p className="glow-total text-3xl sm:text-4xl font-extrabold">{formatARS(k.esperado)}</p>
          <p className="text-[11px] text-slate-500">Fondo + ventas en efectivo − egresos</p>
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {verBitacora && (
            <button onClick={() => setBitacora(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-xs sm:text-sm font-medium text-sky-200 hover:bg-sky-400/20 transition">
              <ClipboardList className="size-4" /> Bitácora
            </button>
          )}
          <button onClick={() => setPanel(panel === "gasto" ? "none" : "gasto")}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs sm:text-sm font-medium hover:bg-white/10 transition">
            <MinusCircle className="size-4" /> Registrar Gasto
          </button>
          <button onClick={() => setPanel(panel === "arqueo" ? "none" : "arqueo")}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 hover:brightness-110 transition">
            <Lock className="size-4" /> Arqueo / Cierre
          </button>
        </div>
      </div>

      {panel === "gasto" && (
        <div className="panel space-y-3 border-red-400/30 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input placeholder="Concepto (ej: Pago proveedor Coca-Cola)" value={gasto.concepto}
              onChange={(e) => setGasto({ ...gasto, concepto: e.target.value })} className={cn(input, "min-w-0 flex-1")} />
            <input placeholder="Monto" value={gasto.monto} inputMode="decimal"
              onChange={(e) => setGasto({ ...gasto, monto: e.target.value.replace(/[^\d.,]/g, "") })} className={cn(input, "w-36")} />
            <input placeholder="Nº comprobante (opcional)" value={gasto.referencia}
              onChange={(e) => setGasto({ ...gasto, referencia: e.target.value })} className={cn(input, "w-56")} />
          </div>

          <input placeholder="Especificación: proveedor, qué se pagó, observaciones…" value={gasto.detalle}
            onChange={(e) => setGasto({ ...gasto, detalle: e.target.value })} className={cn(input, "w-full")} />

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
              <input type="checkbox" checked={gasto.conStock}
                onChange={(e) => setGasto({ ...gasto, conStock: e.target.checked })}
                className="size-4 accent-emerald-500" />
              Este egreso estuvo vinculado a un ingreso de stock
            </label>
            {gasto.conStock && (
              <select value={gasto.motivo} onChange={(e) => setGasto({ ...gasto, motivo: e.target.value })}
                className={cn(input, "text-xs")}>
                {MOTIVOS_STOCK.filter((m) => m.ingreso).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            )}
            <button onClick={registrarGasto} disabled={pending}
              className="ml-auto rounded-lg bg-red-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Registrar egreso
            </button>
          </div>
          {gasto.conStock && (
            <p className="text-[11px] text-slate-500">
              Queda marcado como egreso con ingreso de stock: cargá las cantidades desde Inventario para que el detalle
              aparezca completo en la Bitácora.
            </p>
          )}
        </div>
      )}

      {panel === "arqueo" && (
        <div className="panel border-emerald-400/30 p-5">
          <p className="mb-3 text-sm font-semibold">Contá los billetes reales</p>
          <div className="grid grid-cols-7 gap-2">
            {BILLETES.map((b) => (
              <label key={b} className="text-center text-[11px] text-slate-400">
                {formatARS(b)}
                <input value={conteo[b] ?? ""} onChange={(e) => setConteo({ ...conteo, [b]: e.target.value.replace(/[^\d.,]/g, "") })}
                  placeholder="0" inputMode="decimal" className={cn(input, "mt-1 w-full text-center")} />
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm">Contado: <b>{formatARS(contado)}</b> · Diferencia:{" "}
              <b className={diff === 0 ? "text-emerald-400" : diff > 0 ? "text-sky-300" : "text-red-400"}>{formatARS(diff)}</b></p>
            <button onClick={cerrar} disabled={pending} className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">Confirmar cierre</button>
          </div>
        </div>
      )}

      <div className="panel scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">Bitácora de movimientos</h2>
        <ol className="relative space-y-1 border-l border-white/10 pl-6">
          {[...movs].reverse().map((m) => (
            <li key={m.id} className="relative flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/[0.03]">
              <span className="absolute -left-[34px] grid size-5 place-items-center rounded-full bg-[#0b1020]">
                {esIngreso(m) ? <PlusCircle className="size-5 text-emerald-400" /> : <MinusCircle className="size-5 text-red-400" />}
              </span>
              <div className="flex items-center gap-3 sm:gap-4">
                <span suppressHydrationWarning className="w-[74px] shrink-0 font-mono text-[10px] leading-tight text-slate-500">
                  {new Date(m.created_at).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" })}
                  {" "}
                  {new Date(m.created_at).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-sm">{m.descripcion ?? m.tipo}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">{m.metodo_pago}</span>
              </div>
              <span className={cn("flex items-center gap-1 font-semibold", esIngreso(m) ? "text-emerald-400" : "text-red-400")}>
                {esIngreso(m) ? <ArrowUpCircle className="size-4" /> : <ArrowDownCircle className="size-4" />}
                {esIngreso(m) ? "+" : "−"}{formatARS(Number(m.monto))}
              </span>
            </li>
          ))}
          {!movs.length && <li className="py-6 text-sm text-slate-500">Todavía no hay movimientos en este turno.</li>}
        </ol>
      </div>

      {bitacora && verBitacora && (
        <BitacoraModal inicial={bitacoraInicial} onClose={() => setBitacora(false)} />
      )}
    </div>
  );
}
