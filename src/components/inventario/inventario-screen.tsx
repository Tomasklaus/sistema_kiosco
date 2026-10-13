"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Plus, Search, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarProducto, aplicarAumentoCategoria, cargarDatosDemo, crearProducto } from "@/actions/productos";
import { cn, formatARS } from "@/lib/utils";
import type { ProductoUI } from "@/types";

type Campo = "precio_venta" | "stock";
type Cat = { id: string; nombre: string };

function EditableCell({ value, money, onSave }: { value: number; money?: boolean; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <input autoFocus value={draft} inputMode="decimal"
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") { onSave(Number(draft) || 0); setEditing(false); }
        }}
        className="w-24 rounded-md border border-emerald-400 bg-black/40 px-2 py-1 text-right text-sm outline-none" />
    );
  }
  return (
    <button onClick={() => { setDraft(String(value)); setEditing(true); }} title="Clic para editar"
      className="rounded-md px-2 py-1 transition hover:bg-white/10">
      {money ? formatARS(value) : value}
    </button>
  );
}

function StockBadge({ stock, min }: { stock: number; min: number }) {
  const [txt, cls] =
    stock <= 0 ? ["Agotado", "bg-red-500/20 text-red-400 ring-red-500/40 animate-pulse"]
    : stock <= min ? ["Bajo mínimo", "bg-red-500/15 text-red-400 ring-red-500/30"]
    : stock <= min * 2 ? ["Alerta", "bg-amber-500/15 text-amber-300 ring-amber-500/30"]
    : ["Normal", "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", cls)}>{txt}</span>;
}

export function InventarioScreen({ productos, categorias }: { productos: ProductoUI[]; categorias: Cat[] }) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const start = (fn: () => Promise<unknown>) => startT(async () => { await fn(); });
  const [q, setQ] = useState("");
  const [soloBajo, setSoloBajo] = useState(false);
  const [cat, setCat] = useState("todas");
  const [aumento, setAumento] = useState(false);
  const [aumCat, setAumCat] = useState("");
  const [pct, setPct] = useState("10");
  const [nuevo, setNuevo] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", costo: "", venta: "", stock: "", minimo: "5", cat: "" });

  const lista = useMemo(() => productos.filter((p) => {
    if (q && !`${p.nombre} ${p.codigo_barras ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (soloBajo && p.stock > p.stock_minimo) return false;
    if (cat !== "todas" && p.categoria_id !== cat) return false;
    return true;
  }), [productos, q, soloBajo, cat]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Error");
      toast.success(okMsg); after?.(); router.refresh();
    });

  const editar = (id: string, campo: Campo, v: number) =>
    run(() => actualizarProducto(id, { [campo]: v }), "Guardado");

  const crear = () => {
    if (!form.nombre || !form.venta) return toast.error("Nombre y precio de venta son obligatorios");
    run(() => crearProducto({
      codigo_barras: form.codigo, nombre: form.nombre, precio_costo: Number(form.costo) || 0,
      precio_venta: Number(form.venta), stock: Number(form.stock) || 0, stock_minimo: Number(form.minimo) || 0,
      categoria_id: form.cat || null,
    }), "Producto creado", () => {
      setForm({ codigo: "", nombre: "", costo: "", venta: "", stock: "", minimo: "5", cat: "" });
      setNuevo(false);
    });
  };

  const aplicar = () => {
    const id = aumCat || categorias[0]?.id;
    if (!id) return toast.error("No hay categorías");
    run(() => aplicarAumentoCategoria(id, Number(pct) || 0), `Aumento de ${pct}% aplicado`, () => setAumento(false));
  };

  const input = "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
          <Search className="size-4 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código..." className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="accent-emerald-500" />
          Ver solo bajo stock
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={() => setNuevo((v) => !v)} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
          <Plus className="size-4" /> Nuevo Producto
        </button>
        <button onClick={() => setAumento((v) => !v)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
          <TrendingUp className="size-4" /> Aumento Masivo
        </button>
      </div>

      {aumento && (
        <div className="panel flex flex-wrap items-center gap-3 border-orange-400/30 px-4 py-3 text-sm">
          <b className="text-orange-300">Aumento masivo</b>
          <select value={aumCat || categorias[0]?.id || ""} onChange={(e) => setAumCat(e.target.value)} className={input}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ""))} className={cn(input, "w-20 text-right")} /> %
          <button onClick={aplicar} disabled={pending} className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">Aplicar</button>
          <button onClick={() => setAumento(false)} aria-label="Cerrar" className="ml-auto text-slate-500"><X className="size-4" /></button>
        </div>
      )}

      {nuevo && (
        <div className="panel grid grid-cols-6 items-center gap-2 border-emerald-400/30 px-4 py-3">
          <input placeholder="Código de barras" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className={input} />
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={cn(input, "col-span-2")} />
          <input placeholder="Costo" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value.replace(/\D/g, "") })} className={input} />
          <input placeholder="Venta" value={form.venta} onChange={(e) => setForm({ ...form, venta: e.target.value.replace(/\D/g, "") })} className={input} />
          <input placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} className={input} />
          <input placeholder="Stock mínimo" value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value.replace(/\D/g, "") })} className={input} />
          <select value={form.cat} onChange={(e) => setForm({ ...form, cat: e.target.value })} className={cn(input, "col-span-2")}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={crear} disabled={pending} className="col-span-3 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Guardar producto</button>
        </div>
      )}

      <div className="panel scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#131a2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th><th>Producto</th>
              <th className="text-right">Costo</th><th className="text-right">Venta</th>
              <th className="text-right">Margen</th><th className="pl-6">Stock</th><th className="pr-4">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const margen = p.precio_venta ? ((p.precio_venta - p.precio_costo) / p.precio_venta) * 100 : 0;
              return (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{p.codigo_barras}</td>
                  <td className="py-2 font-medium">{p.emoji} {p.nombre}</td>
                  <td className="text-right text-slate-400">{formatARS(p.precio_costo)}</td>
                  <td className="text-right"><EditableCell money value={p.precio_venta} onSave={(v) => editar(p.id, "precio_venta", v)} /></td>
                  <td className={cn("text-right font-medium", margen < 20 ? "text-amber-300" : "text-emerald-400")}>{margen.toFixed(0)}%</td>
                  <td className="pl-6"><EditableCell value={p.stock} onSave={(v) => editar(p.id, "stock", v)} /></td>
                  <td className="pr-4"><StockBadge stock={p.stock} min={p.stock_minimo} /></td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr><td colSpan={7} className="py-12 text-center text-slate-500">
                {productos.length ? "Sin resultados" : (
                  <div className="space-y-3">
                    <p>Todavía no tenés productos.</p>
                    <button onClick={() => run(cargarDatosDemo, "Datos de ejemplo cargados")} disabled={pending}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 px-4 py-2 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                      <Database className="size-4" /> Cargar datos de ejemplo
                    </button>
                  </div>
                )}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
