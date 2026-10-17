"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Database, Pencil, Plus, Printer, Search, Star, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarProducto, aplicarAumentoCategoria, cargarDatosDemo } from "@/actions/productos";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { EmojiPicker } from "@/components/inventario/emoji-picker";
import { ProductoFormModal } from "@/components/inventario/producto-form-modal";
import { beepError, beepOk, buscarPorCodigo, imprimirEtiquetas, normalizarCodigo } from "@/lib/barcode";
import { EMOJI_FALLBACK, EMOJI_POR_CATEGORIA } from "@/lib/producto-ui";
import { cn, formatARS } from "@/lib/utils";
import type { ProductoUI } from "@/types";

type Cat = { id: string; nombre: string };

/** Emoji que vería el producto si no tuviera uno propio (según su categoría). */
function emojiSugerido(categorias: Cat[], categoriaId: string | null): string {
  const nombre = categorias.find((c) => c.id === categoriaId)?.nombre;
  return (nombre && EMOJI_POR_CATEGORIA[nombre]) || EMOJI_FALLBACK;
}

/** Celda numérica: admite decimales (costo, precios, stock). */
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

/** Celda de texto: clic para editar el nombre del producto. */
function EditableText({ value, onSave, className }: { value: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <input autoFocus value={draft} maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter") {
            const limpio = draft.trim();
            setEditing(false);
            if (!limpio) return toast.error("El nombre no puede quedar vacío");
            if (limpio !== value) onSave(limpio);
          }
        }}
        className={cn("w-44 rounded-md border border-emerald-400 bg-black/40 px-2 py-1 text-sm outline-none", className)} />
    );
  }
  return (
    <button onClick={() => { setDraft(value); setEditing(true); }} title="Clic para editar el nombre"
      className={cn("rounded-md px-1 -mx-1 py-0.5 text-left transition hover:bg-white/10", className)}>
      {value}
    </button>
  );
}

/** Celda de categoría: cambia la categoría del producto desde la tabla. */
function CategoryCell({ value, categorias, onSave }: {
  value: string | null; categorias: Cat[]; onSave: (id: string | null) => void;
}) {
  return (
    <select value={value ?? ""} onChange={(e) => onSave(e.target.value || null)}
      title="Cambiar categoría"
      className="rounded-md border border-transparent bg-black/30 px-1.5 py-1 text-xs text-slate-300 outline-none transition hover:border-white/10 focus:border-emerald-400">
      <option value="">Sin categoría</option>
      {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
    </select>
  );
}

/** Interruptor de "acceso rápido" (favoritos del POS). */
function FavoriteToggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={value ? "Quitar de acceso rápido" : "Agregar a acceso rápido"}
      aria-pressed={value}
      className={cn("rounded-md p-1 transition hover:bg-white/10", value ? "text-amber-300" : "text-slate-600 hover:text-slate-300")}>
      <Star className={cn("size-4", value && "fill-amber-300")} />
    </button>
  );
}


/** Celda de código: clic para escribirlo o escanearlo y asignarlo al producto. */
function CodeCell({ id, value, onSave, onCamera }: {
  id: string; value: string | null; onSave: (v: string) => void; onCamera: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input autoFocus value={draft} data-scan-field={id} placeholder="Escaneá o escribí"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setTimeout(() => setEditing(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
          }}
          className="w-36 rounded-md border border-emerald-400 bg-black/40 px-2 py-1 font-mono text-xs outline-none" />
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setEditing(false); onCamera(); }}
          aria-label="Escanear con cámara" className="text-slate-400 hover:text-emerald-300"><Camera className="size-3.5" /></button>
      </span>
    );
  }
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }} title="Clic para asignar o cambiar el código"
      className={cn("rounded-md px-1.5 py-1 font-mono text-xs transition hover:bg-white/10", value ? "text-slate-400" : "text-amber-400 underline decoration-dotted")}>
      {value ?? "+ asignar"}
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

export function InventarioScreen({ productos, categorias, codigoInicial, ocultarCostos = false }: {
  productos: ProductoUI[];
  categorias: Cat[];
  codigoInicial?: string;
  ocultarCostos?: boolean;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const start = (fn: () => Promise<unknown>) => startT(async () => { await fn(); });
  const [q, setQ] = useState("");
  const [soloBajo, setSoloBajo] = useState(false);
  const [cat, setCat] = useState("todas");
  const [aumento, setAumento] = useState(false);
  const [aumCat, setAumCat] = useState("");
  const [pct, setPct] = useState("10");
  // Modal de alta/edición: "nuevo" | id del producto | null (cerrado)
  const [formTarget, setFormTarget] = useState<"nuevo" | string | null>(codigoInicial ? "nuevo" : null);
  // Código con el que se abre el alta (viene del lector o de la URL)
  const [codigoAlta, setCodigoAlta] = useState(codigoInicial ?? "");

  // Modal de escáner con cámara en inventario
  const [camaraTarget, setCamaraTarget] = useState<"nuevo" | string | null>(null);

  // Selector de emoji para un producto ya existente
  const [emojiTarget, setEmojiTarget] = useState<"nuevo" | string | null>(null);

  // Si se pasa un código inicial por querystring (desde el POS al no encontrar un producto),
  // el estado inicial del modal ya abre el alta precargada con ese código.

  // Se puede filtrar por categoría por id o por nombre (como llega desde el POS)
  const lista = useMemo(() => productos.filter((p) => {
    if (q && !`${p.nombre} ${p.codigo_barras ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (soloBajo && p.stock > p.stock_minimo) return false;
    if (cat !== "todas" && p.categoria_id !== cat && (p.categoria ?? "").toLowerCase() !== cat.toLowerCase()) return false;
    return true;
  }), [productos, q, soloBajo, cat]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        beepError();
        return toast.error(r.error ?? "Error");
      }
      beepOk();
      toast.success(okMsg);
      after?.();
      router.refresh();
    });

  const editar = (id: string, campo: "precio_costo" | "precio_venta" | "stock" | "stock_minimo", v: number) =>
    run(() => actualizarProducto(id, { [campo]: v }), "Guardado");

  const renombrar = (id: string, nombre: string) =>
    run(() => actualizarProducto(id, { nombre }), "Nombre actualizado");

  const cambiarCategoria = (id: string, categoria_id: string | null) =>
    run(() => actualizarProducto(id, { categoria_id }), "Categoría actualizada");

  const toggleFavorito = (p: ProductoUI) =>
    run(() => actualizarProducto(p.id, { acceso_rapido: !p.acceso_rapido }), p.acceso_rapido ? "Quitado de acceso rápido" : "Agregado a acceso rápido");

  const asignarCodigo = (id: string, codigo: string) =>
    run(() => actualizarProducto(id, { codigo_barras: codigo }), "Código de barras actualizado");

  const asignarEmoji = (id: string, emoji: string | null) =>
    run(() => actualizarProducto(id, { emoji }), emoji ? "Emoji actualizado" : "Emoji restablecido al de la categoría");

  const abrirEdicion = (p: ProductoUI) => {
    setCodigoAlta(p.codigo_barras ?? "");
    setFormTarget(p.id);
  };

  const abrirAlta = (codigo = "") => {
    setCodigoAlta(codigo);
    setFormTarget("nuevo");
  };

  const aplicar = () => {
    const id = aumCat || categorias[0]?.id;
    if (!id) return toast.error("No hay categorías");
    run(() => aplicarAumentoCategoria(id, Number(pct) || 0), `Aumento de ${pct}% aplicado`, () => setAumento(false));
  };

  const imprimirSeleccionadas = () => {
    const paraImprimir = lista
      .filter((p) => p.codigo_barras)
      .map((p) => ({ nombre: p.nombre, codigo: p.codigo_barras!, precio: p.precio_venta }));
    if (!paraImprimir.length) return toast.warning("No hay productos con código de barras en la lista actual");
    imprimirEtiquetas(paraImprimir);
  };

  // Escáner HID en la pantalla de inventario: si no hay un input editándose, busca el producto o abre el alta
  const onScanInventario = useCallback((raw: string, targetEl: HTMLElement | null) => {
    const code = normalizarCodigo(raw);
    if (!code) return;

    // Si el formulario de alta está abierto, completamos el código en el modal
    if (formTarget === "nuevo") {
      setCodigoAlta(code);
      beepOk();
      toast.success(`Código escaneado: ${code}`);
      return;
    }

    // Si hay un input con data-scan-field, lo asignamos directamente a ese producto
    const prodIdAsignar = targetEl?.getAttribute("data-scan-field");
    if (prodIdAsignar) {
      asignarCodigo(prodIdAsignar, code);
      return;
    }

    // Búsqueda rápida por escáner
    const existente = buscarPorCodigo(productos, code);
    if (existente) {
      beepOk();
      setQ(code);
      toast.info(`Producto encontrado: ${existente.nombre}`);
    } else {
      beepError();
      abrirAlta(code);
      toast.info(`Código ${code} no existe. Listo para darlo de alta.`);
    }
  }, [formTarget, productos]);

  useBarcodeScanner(onScanInventario, { enabled: !camaraTarget && !emojiTarget && !formTarget });

  const input = "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
          <Search className="size-4 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o escanear código..." className="flex-1 bg-transparent text-sm outline-none" />
          {q && <button onClick={() => setQ("")} className="text-slate-400 hover:text-white"><X className="size-3.5" /></button>}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={soloBajo} onChange={(e) => setSoloBajo(e.target.checked)} className="accent-emerald-500" />
          Ver solo bajo stock
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={input}>
          <option value="todas">Todas las categorías</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={() => abrirAlta()} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
          <Plus className="size-4" /> Nuevo Producto
        </button>
        {!ocultarCostos && (
          <button onClick={() => setAumento((v) => !v)} className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
            <TrendingUp className="size-4" /> Aumento Masivo
          </button>
        )}
        <button onClick={imprimirSeleccionadas} title="Imprimir etiquetas de códigos de barra para góndola" className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
          <Printer className="size-4 text-emerald-400" /> Etiquetas
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


      <div className="panel scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#131a2e] text-left text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-3 text-center" title="Acceso rápido en el POS">★</th>
              <th className="px-4 py-3">Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              {!ocultarCostos && <th className="text-right">Costo</th>}
              <th className="text-right">Venta</th>
              {!ocultarCostos && <th className="text-right">Margen</th>}
              <th className="pl-6">Stock</th>
              <th className="pl-4">Mín.</th>
              <th className="pr-4">Estado</th>
              <th className="pr-2 text-center">Editar</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const margen = p.precio_venta ? ((p.precio_venta - p.precio_costo) / p.precio_venta) * 100 : 0;
              return (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-2 py-2 text-center"><FavoriteToggle value={p.acceso_rapido} onToggle={() => toggleFavorito(p)} /></td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <CodeCell
                      id={p.id}
                      value={p.codigo_barras}
                      onSave={(v) => asignarCodigo(p.id, v)}
                      onCamera={() => setCamaraTarget(p.id)}
                    />
                  </td>
                  <td className="py-2 font-medium">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEmojiTarget(p.id)} title="Cambiar emoji del producto"
                        className="rounded-md px-1 py-0.5 text-base transition hover:bg-white/10">
                        {p.emoji}
                      </button>
                      <EditableText value={p.nombre} onSave={(v) => renombrar(p.id, v)} className="max-w-[16rem] truncate" />
                    </div>
                  </td>
                  <td className="py-2">
                    <CategoryCell value={p.categoria_id} categorias={categorias} onSave={(v) => cambiarCategoria(p.id, v)} />
                  </td>
                  {!ocultarCostos && (
                    <td className="pr-2 text-right text-slate-400"><EditableCell money value={p.precio_costo} onSave={(v) => editar(p.id, "precio_costo", v)} /></td>
                  )}
                  <td className="text-right"><EditableCell money value={p.precio_venta} onSave={(v) => editar(p.id, "precio_venta", v)} /></td>
                  {!ocultarCostos && (
                    <td className={cn("pr-2 text-right font-medium", margen < 20 ? "text-amber-300" : "text-emerald-400")}>{margen.toFixed(0)}%</td>
                  )}
                  <td className="pl-6"><EditableCell value={p.stock} onSave={(v) => editar(p.id, "stock", v)} /></td>
                  <td className="pl-4"><EditableCell value={p.stock_minimo} onSave={(v) => editar(p.id, "stock_minimo", v)} /></td>
                  <td className="pr-4"><StockBadge stock={p.stock} min={p.stock_minimo} /></td>
                  <td className="pr-2 text-center">
                    <button onClick={() => abrirEdicion(p)} title="Editar todos los datos del producto"
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-500/15 hover:text-emerald-300">
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr><td colSpan={11} className="py-12 text-center text-slate-500">
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

      {emojiTarget && emojiTarget !== "nuevo" && (() => {
        const producto = productos.find((p) => p.id === emojiTarget) ?? null;
        return (
          <EmojiPicker
            titulo={producto?.nombre ?? "Producto"}
            sugerido={emojiSugerido(categorias, producto?.categoria_id ?? null)}
            actual={producto?.emoji ?? null}
            onSelect={(emoji) => {
              asignarEmoji(emojiTarget, emoji);
              setEmojiTarget(null);
            }}
            onClose={() => setEmojiTarget(null)}
          />
        );
      })()}

      {camaraTarget && camaraTarget !== "nuevo" && (
        <CameraScanner
          onDetect={(code) => {
            asignarCodigo(camaraTarget, normalizarCodigo(code));
            setCamaraTarget(null);
          }}
          onClose={() => setCamaraTarget(null)}
        />
      )}

      {formTarget && (
        <ProductoFormModal
          producto={formTarget === "nuevo" ? null : productos.find((p) => p.id === formTarget) ?? null}
          categorias={categorias}
          codigoInicial={formTarget === "nuevo" ? codigoAlta : undefined}
          ocultarCostos={ocultarCostos}
          onClose={() => setFormTarget(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
