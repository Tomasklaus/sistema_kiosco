"use client";

import { useEffect, useState } from "react";
import { Camera, Save, Smile, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarProducto, crearProducto, eliminarProducto } from "@/actions/productos";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { EmojiPicker } from "@/components/inventario/emoji-picker";
import { generarCodigoInterno, normalizarCodigo } from "@/lib/barcode";
import { EMOJI_FALLBACK, EMOJI_POR_CATEGORIA } from "@/lib/producto-ui";
import { cn, formatARS } from "@/lib/utils";
import type { ProductoUI } from "@/types";

type Cat = { id: string; nombre: string };

export type FormProducto = {
  codigo: string; nombre: string; costo: string; venta: string;
  stock: string; minimo: string; cat: string; emoji: string; favorito: boolean;
};

/** Formulario en blanco; si se pasa un producto, precarga sus datos para editarlo. */
export function formDesdeProducto(p: ProductoUI | null, codigoInicial = ""): FormProducto {
  return {
    codigo: p?.codigo_barras ?? codigoInicial,
    nombre: p?.nombre ?? "",
    costo: p ? String(p.precio_costo) : "",
    venta: p ? String(p.precio_venta) : "",
    stock: p ? String(p.stock) : "",
    minimo: p ? String(p.stock_minimo) : "5",
    cat: p?.categoria_id ?? "",
    emoji: p?.emoji ?? "",
    favorito: p?.acceso_rapido ?? false,
  };
}

const inputCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

/** Modal para crear o editar un producto con todos sus campos. */
export function ProductoFormModal({ producto, categorias, codigoInicial, ocultarCostos = false, onClose, onSaved }: {
  producto?: ProductoUI | null;
  categorias: Cat[];
  codigoInicial?: string;
  ocultarCostos?: boolean;
  onClose: () => void;
  onSaved?: (mensaje: string) => void;
}) {
  const editando = Boolean(producto?.id);
  const [form, setForm] = useState<FormProducto>(() => formDesdeProducto(producto ?? null, codigoInicial));
  const [guardando, setGuardando] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [camara, setCamara] = useState(false);
  const [borrar, setBorrar] = useState(false);

  const set = (parcial: Partial<FormProducto>) => setForm((f) => ({ ...f, ...parcial }));

  // Escape cierra el modal (salvo cuando hay un sub-modal abierto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !emojis && !camara) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [emojis, camara, onClose]);

  const sugerido = (form.cat && EMOJI_POR_CATEGORIA[categorias.find((c) => c.id === form.cat)?.nombre ?? ""]) || EMOJI_FALLBACK;
  const emojiMostrado = form.emoji || sugerido;
  const margen = Number(form.venta) > 0 ? ((Number(form.venta) - Number(form.costo)) / Number(form.venta)) * 100 : 0;

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error("El nombre es obligatorio");
    if (!form.venta || Number(form.venta) < 0) return toast.error("Ingresá un precio de venta válido");

    setGuardando(true);
    const datos = {
      categoria_id: form.cat || null,
      nombre: form.nombre,
      precio_costo: Number(form.costo) || 0,
      precio_venta: Number(form.venta),
      stock: Number(form.stock) || 0,
      stock_minimo: Number(form.minimo) || 0,
      codigo_barras: form.codigo,
      emoji: form.emoji || null,
      acceso_rapido: form.favorito,
    };
    const r = editando
      ? await actualizarProducto(producto!.id, datos)
      : await crearProducto({ ...datos, codigo_barras: form.codigo });
    setGuardando(false);

    if (!r.ok) return toast.error(r.error ?? "Error al guardar");
    const mensaje = editando ? "Producto actualizado" : "Producto creado";
    toast.success(mensaje);
    onSaved?.(mensaje);
    onClose();
  };

  const confirmarBorrado = async () => {
    if (!producto) return;
    setGuardando(true);
    const r = await eliminarProducto(producto.id);
    setGuardando(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo dar de baja");
    toast.success("Producto dado de baja");
    onSaved?.("Producto dado de baja");
    onClose();
  };

  const autogenerarCodigo = () => {
    const codigo = generarCodigoInterno(producto?.codigo_barras ? [producto.codigo_barras] : []);
    set({ codigo });
    toast.success(`Código interno generado: ${codigo}`);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
        role="dialog" aria-label={editando ? "Editar producto" : "Nuevo producto"}>
        <div className="panel pop my-auto w-full max-w-lg">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{editando ? "Editar producto" : "Nuevo producto"}</p>
              <p className="truncate text-xs text-slate-500">{form.nombre || "Completá los datos del producto"}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="size-5" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-6">
            {/* Código + cámara + generador */}
            <div className="relative col-span-2 flex items-center sm:col-span-6">
              <input placeholder="Código de barras" value={form.codigo}
                onChange={(e) => set({ codigo: e.target.value })} className={cn(inputCls, "pr-16 font-mono")} />
              <div className="absolute right-1 flex items-center gap-1">
                <button type="button" onClick={() => setCamara(true)} title="Escanear con cámara"
                  className="rounded p-1 text-slate-400 hover:text-emerald-300"><Camera className="size-4" /></button>
                <button type="button" onClick={autogenerarCodigo} title="Generar código interno (EAN-13)"
                  className="rounded p-1 text-slate-400 hover:text-amber-300"><Sparkles className="size-4" /></button>
              </div>
            </div>

            {/* Nombre + emoji */}
            <input placeholder="Nombre del producto" value={form.nombre}
              onChange={(e) => set({ nombre: e.target.value })} className={cn(inputCls, "col-span-2 sm:col-span-5")} />
            <button type="button" onClick={() => setEmojis(true)} title="Elegir emoji del producto"
              className={cn(inputCls, "col-span-2 flex items-center justify-center gap-1.5 sm:col-span-1")}>
              <span className="text-lg leading-none">{emojiMostrado}</span>
              <Smile className="size-4 text-slate-400" />
            </button>

            {!ocultarCostos && (
              <label className="col-span-1 text-[11px] font-medium text-slate-400">
                Costo ($)
                <input placeholder="0" value={form.costo} inputMode="decimal"
                  onChange={(e) => set({ costo: e.target.value.replace(/[^\d.]/g, "") })}
                  className={cn(inputCls, "mt-1")} />
              </label>
            )}
            <label className={cn("col-span-1 text-[11px] font-medium text-slate-400", ocultarCostos && "col-span-2 sm:col-span-3")}>
              Venta ($)
              <input placeholder="0" value={form.venta} inputMode="decimal"
                onChange={(e) => set({ venta: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 text-[11px] font-medium text-slate-400">
              Stock
              <input placeholder="0" value={form.stock} inputMode="decimal"
                onChange={(e) => set({ stock: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 text-[11px] font-medium text-slate-400">
              Mínimo
              <input placeholder="5" value={form.minimo} inputMode="decimal"
                onChange={(e) => set({ minimo: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>

            <label className="col-span-2 text-[11px] font-medium text-slate-400">
              Categoría
              <select value={form.cat} onChange={(e) => set({ cat: e.target.value })} className={cn(inputCls, "mt-1")}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>

            <label className="col-span-2 flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-medium text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={form.favorito} onChange={(e) => set({ favorito: e.target.checked })}
                className="accent-emerald-500" />
              Acceso rápido
            </label>

            {!ocultarCostos && (
              <div className="col-span-2 self-end text-right text-[11px] text-slate-400">
                Margen
                <p className={cn("text-sm font-semibold", margen < 20 ? "text-amber-300" : "text-emerald-400")}>
                  {margen.toFixed(0)}% · {formatARS(Number(form.venta) || 0)}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3">
            {editando && (
              borrar ? (
                <button onClick={confirmarBorrado} disabled={guardando}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50">
                  <Trash2 className="size-3.5" /> Confirmar baja
                </button>
              ) : (
                <button onClick={() => setBorrar(true)} disabled={guardando} title="Dar de baja el producto (conserva las ventas)"
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                  <Trash2 className="size-3.5" /> Dar de baja
                </button>
              )
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50">
                <Save className="size-4" /> {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {emojis && (
        <EmojiPicker
          titulo={form.nombre || "Producto"}
          sugerido={sugerido}
          actual={form.emoji || null}
          onSelect={(emoji) => { set({ emoji: emoji ?? "" }); setEmojis(false); }}
          onClose={() => setEmojis(false)}
        />
      )}

      {camara && (
        <CameraScanner
          onDetect={(code) => {
            const normalizado = normalizarCodigo(code);
            set({ codigo: normalizado });
            toast.success(`Código escaneado: ${normalizado}`);
          }}
          onClose={() => setCamara(false)}
        />
      )}
    </>
  );
}
