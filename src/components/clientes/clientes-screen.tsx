"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { crearCliente, registrarMovCuenta } from "@/actions/clientes";
import { cn, formatARS } from "@/lib/utils";
import type { ClienteConMovs, MetodoPago } from "@/types";

const saldoDe = (c: ClienteConMovs) =>
  c.movimientos_cuenta.reduce((a, m) => a + (m.tipo === "cargo" ? Number(m.monto) : -Number(m.monto)), 0);

// saldo > 0: el cliente debe. saldo < 0: tiene saldo a favor.
const etiquetaSaldo = (s: number) => (s > 0 ? `Debe ${formatARS(s)}` : s < 0 ? `A favor ${formatARS(-s)}` : "Saldo $0");
const colorSaldo = (s: number) => (s > 0 ? "text-red-400" : s < 0 ? "text-emerald-400" : "text-slate-500");

export function ClientesScreen({ clientes }: { clientes: ClienteConMovs[] }) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const start = (fn: () => Promise<unknown>) => startT(async () => { await fn(); });
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<"alfa" | "deuda">("deuda");
  const [sel, setSel] = useState(clientes[0]?.id ?? "");
  const [accion, setAccion] = useState<null | "cargo" | "pago">(null);
  const [monto, setMonto] = useState("");
  const [detalle, setDetalle] = useState("");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [nuevo, setNuevo] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ nombre: "", telefono: "" });

  const lista = useMemo(() => {
    const f = clientes.filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()));
    return f.sort((a, b) => orden === "alfa" ? a.nombre.localeCompare(b.nombre) : saldoDe(b) - saldoDe(a));
  }, [clientes, q, orden]);

  const cliente = clientes.find((c) => c.id === sel) ?? clientes[0];
  const input = "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

  const confirmar = () => {
    const m = Number(monto);
    if (!cliente || !accion || !m) return toast.error("Ingresá un monto");
    start(async () => {
      const r = await registrarMovCuenta(cliente.id, accion, m, detalle || (accion === "pago" ? "Pago a cuenta" : "Deuda manual"), metodo);
      if (!r.ok) return toast.error(r.error);
      toast.success(accion === "pago" ? "Pago registrado" : "Deuda sumada");
      setAccion(null); setMonto(""); setDetalle(""); router.refresh();
    });
  };

  const crear = () => {
    if (!nuevoForm.nombre.trim()) return toast.error("Ingresá el nombre");
    start(async () => {
      const r = await crearCliente(nuevoForm.nombre.trim(), nuevoForm.telefono);
      if (!r.ok) return toast.error(r.error);
      toast.success("Cliente creado");
      setNuevoForm({ nombre: "", telefono: "" }); setNuevo(false); router.refresh();
    });
  };

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[300px_1fr] lg:grid-cols-[340px_1fr] gap-4">
      <aside className="panel flex min-h-[300px] md:min-h-0 flex-col p-3">
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
          <Search className="size-4 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente..." className="flex-1 bg-transparent text-sm outline-none" />
          <button onClick={() => setNuevo((v) => !v)} title="Nuevo cliente" className="text-emerald-400"><UserPlus className="size-4" /></button>
        </div>
        {nuevo && (
          <div className="mb-3 space-y-2 rounded-xl border border-emerald-400/30 p-2">
            <input placeholder="Nombre" value={nuevoForm.nombre} onChange={(e) => setNuevoForm({ ...nuevoForm, nombre: e.target.value })} className={cn(input, "w-full")} />
            <input placeholder="Teléfono" value={nuevoForm.telefono} onChange={(e) => setNuevoForm({ ...nuevoForm, telefono: e.target.value })} className={cn(input, "w-full")} />
            <button onClick={crear} disabled={pending} className="w-full rounded-lg bg-emerald-500 py-1.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Crear cliente</button>
          </div>
        )}
        <div className="mb-2 flex gap-1 text-xs">
          {(["deuda", "alfa"] as const).map((o) => (
            <button key={o} onClick={() => setOrden(o)} className={cn("rounded-md px-2.5 py-1", orden === o ? "bg-white/10 text-white" : "text-slate-500")}>
              {o === "deuda" ? "Por deuda" : "A–Z"}
            </button>
          ))}
        </div>
        <div className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto">
          {lista.map((c) => {
            const s = saldoDe(c);
            return (
              <button key={c.id} onClick={() => setSel(c.id)}
                className={cn("w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5", cliente?.id === c.id && "bg-white/10 ring-1 ring-emerald-400/40")}>
                <p className="text-sm font-medium">{c.nombre}</p>
                <p className={cn("text-xs", colorSaldo(s))}>{etiquetaSaldo(s)}</p>
              </button>
            );
          })}
          {!lista.length && <p className="py-6 text-center text-sm text-slate-500">Sin clientes. Creá uno con el ícono +.</p>}
        </div>
      </aside>

      {cliente ? (
        <section className="panel flex min-h-0 flex-col p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold">{cliente.nombre}</h2>
              <p className="text-sm text-slate-500">📞 {cliente.telefono ?? "Sin teléfono"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                {saldoDe(cliente) < 0 ? "Saldo a favor" : saldoDe(cliente) > 0 ? "Deuda actual" : "Saldo"}
              </p>
              <p className={cn("text-3xl font-extrabold", saldoDe(cliente) > 0 ? "text-red-400" : saldoDe(cliente) < 0 ? "text-emerald-400" : "text-slate-400")}>
                {formatARS(Math.abs(saldoDe(cliente)))}
              </p>
            </div>
          </div>

          <div className="my-4 grid grid-cols-2 gap-3">
            <button onClick={() => setAccion("cargo")} className="flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 py-4 font-semibold text-red-300 hover:bg-red-500/20">
              <Plus className="size-5" /> Sumar Deuda
            </button>
            <button onClick={() => setAccion("pago")} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-4 font-bold text-slate-950 hover:brightness-110">
              <HandCoins className="size-5" /> Registrar Pago
            </button>
          </div>

          {accion && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <span className="text-sm font-medium">{accion === "pago" ? "Pago:" : "Deuda:"}</span>
              <input autoFocus placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && confirmar()} className={cn(input, "w-32")} />
              {accion === "pago" && (
                <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={input}>
                  <option value="efectivo">Efectivo</option><option value="mercadopago">MercadoPago</option><option value="tarjeta">Tarjeta</option>
                </select>
              )}
              <input placeholder="Detalle (opcional)" value={detalle} onChange={(e) => setDetalle(e.target.value)} className={cn(input, "min-w-40 flex-1")} />
              {accion === "pago" && Number(monto) > Math.max(0, saldoDe(cliente)) && (
                <span className="w-full text-xs text-emerald-400">
                  Quedará {formatARS(Number(monto) - Math.max(0, saldoDe(cliente)))} a favor del cliente.
                </span>
              )}
              <button onClick={confirmar} disabled={pending} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Confirmar</button>
              <button onClick={() => setAccion(null)} className="text-sm text-slate-500">Cancelar</button>
            </div>
          )}

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr><th className="py-2">Fecha</th><th>Detalle</th><th className="text-right">Cargo</th><th className="text-right">Pago</th></tr>
              </thead>
              <tbody>
                {[...cliente.movimientos_cuenta].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td suppressHydrationWarning className="py-2.5 text-slate-500">
                      {new Date(m.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}
                    </td>
                    <td>{m.notas ?? (m.tipo === "cargo" ? "Cargo" : "Pago")}</td>
                    <td className="text-right text-red-400">{m.tipo === "cargo" ? formatARS(Number(m.monto)) : ""}</td>
                    <td className="text-right text-emerald-400">{m.tipo === "pago" ? formatARS(Number(m.monto)) : ""}</td>
                  </tr>
                ))}
                {!cliente.movimientos_cuenta.length && <tr><td colSpan={4} className="py-10 text-center text-slate-500">Sin movimientos</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel grid place-items-center text-slate-500">Creá tu primer cliente para empezar.</section>
      )}
    </div>
  );
}
