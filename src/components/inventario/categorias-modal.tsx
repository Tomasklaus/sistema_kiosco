"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Pencil, Smile, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarCategoria, aplicarEmojiCategoria, crearCategoria, eliminarCategoria } from "@/actions/categorias";
import { EmojiPicker } from "@/components/inventario/emoji-picker";
import { EMOJI_CATEGORIA, normalizarNombreCategoria } from "@/lib/producto-ui";
import { cn } from "@/lib/utils";
import type { CategoriaConUso } from "@/types";

const inputCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

/**
 * Gestión de categorías: alta, renombrado, emoji por defecto y eliminación.
 * Al eliminar, los productos de la categoría quedan "sin categoría" (no se borran).
 */
export function CategoriasModal({ categorias, onClose, onSaved }: {
  categorias: CategoriaConUso[];
  onClose: () => void;
  onSaved: (mensaje: string) => void;
}) {
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [emojiPara, setEmojiPara] = useState<CategoriaConUso | null>(null);
  const [pending, setPending] = useState(false);

  // Escape cierra el modal (salvo cuando hay un sub-modal abierto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !emojiPara) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [emojiPara, onClose]);

  const crear = async () => {
    const nombre = normalizarNombreCategoria(nueva);
    if (!nombre) return toast.error("Escribí el nombre de la categoría");
    if (categorias.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      return toast.error("Ya tenés una categoría con ese nombre");
    }
    setPending(true);
    const r = await crearCategoria({ nombre });
    setPending(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo crear la categoría");
    toast.success(`Categoría "${r.data?.nombre ?? nombre}" creada`);
    setNueva("");
    onSaved("Categoría creada");
  };

  const renombrar = async (id: string, nombre: string) => {
    const limpio = normalizarNombreCategoria(nombre);
    const actual = categorias.find((c) => c.id === id);
    setEditando(null);
    if (!limpio || !actual || limpio === actual.nombre) return;
    if (categorias.some((c) => c.id !== id && c.nombre.toLowerCase() === limpio.toLowerCase())) {
      return toast.error("Ya tenés una categoría con ese nombre");
    }
    setPending(true);
    const r = await actualizarCategoria(id, { nombre: limpio });
    setPending(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo renombrar");
    toast.success("Categoría actualizada");
    onSaved("Categoría actualizada");
  };

  const eliminar = async (c: CategoriaConUso) => {
    setPending(true);
    const r = await eliminarCategoria(c.id);
    setPending(false);
    setBorrando(null);
    if (!r.ok) return toast.error(r.error ?? "No se pudo eliminar la categoría");
    toast.success(c.productos ? `Categoría eliminada. ${c.productos} producto(s) quedaron sin categoría` : "Categoría eliminada");
    onSaved("Categoría eliminada");
  };

  const aplicarEmoji = async (c: CategoriaConUso, emoji: string | null) => {
    setEmojiPara(null);
    if (!emoji) return;
    setPending(true);
    const r = await aplicarEmojiCategoria(c.id, emoji);
    setPending(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo aplicar el emoji");
    toast.success(r.data ? `${emoji} aplicado a ${r.data} producto(s)` : `Emoji ${emoji} guardado para nuevos productos`);
    onSaved("Emoji de categoría actualizado");
  };

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
        role="dialog" aria-label="Gestionar categorías">
        <div className="panel pop my-auto w-full max-w-lg">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Tag className="size-4 text-emerald-400" /> Categorías</p>
              <p className="text-xs text-slate-500">{categorias.length} categoría(s) · usalas para filtrar el POS y el inventario</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="size-5" /></button>
          </div>

          {/* Alta */}
          <div className="flex items-center gap-2 border-b border-white/5 p-3">
            <input autoFocus value={nueva} onChange={(e) => setNueva(e.target.value)} maxLength={40}
              placeholder="Nueva categoría (ej. Librería)"
              onKeyDown={(e) => { if (e.key === "Enter") crear(); }}
              className={inputCls} />
            <button onClick={crear} disabled={pending || !nueva.trim()}
              className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50">
              Agregar
            </button>
          </div>

          {/* Lista */}
          <div className="scroll-thin max-h-80 overflow-y-auto">
            {!categorias.length && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Todavía no tenés categorías.</p>
            )}
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
                <button onClick={() => setEmojiPara(c)} title="Elegir emoji por defecto de la categoría"
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-black/30 text-lg transition hover:bg-white/10">
                  {c.emoji}
                </button>

                {editando === c.id ? (
                  <input autoFocus defaultValue={c.nombre} maxLength={40}
                    onBlur={(e) => renombrar(c.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditando(null);
                      if (e.key === "Enter") renombrar(c.id, e.currentTarget.value);
                    }}
                    className={cn(inputCls, "py-1")} />
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.nombre}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.productos} producto(s){c.emoji === EMOJI_CATEGORIA ? " · sin emoji propio" : ""}
                    </p>
                  </div>
                )}

                {borrando === c.id ? (
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-1 text-[11px] text-red-300">
                      <AlertTriangle className="size-3.5" />
                      {c.productos ? `${c.productos} sin categoría` : "¿Eliminar?"}
                    </span>
                    <button onClick={() => eliminar(c)} disabled={pending} title="Confirmar eliminación"
                      className="rounded-md bg-red-500/20 p-1.5 text-red-300 hover:bg-red-500/30 disabled:opacity-50"><Check className="size-4" /></button>
                    <button onClick={() => setBorrando(null)} title="Cancelar" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10"><X className="size-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEmojiPara(c)} title="Emoji por defecto" aria-label="Emoji por defecto"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-amber-300"><Smile className="size-4" /></button>
                    <button onClick={() => setEditando(c.id)} title="Renombrar" aria-label="Renombrar"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-emerald-300"><Pencil className="size-4" /></button>
                    <button onClick={() => setBorrando(c.id)} title="Eliminar categoría" aria-label="Eliminar categoría"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300"><Trash2 className="size-4" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-3">
            <p className="text-[11px] text-slate-500">El emoji es el que ven los productos que no tienen uno propio.</p>
            <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10">
              Listo
            </button>
          </div>
        </div>
      </div>

      {emojiPara && (
        <EmojiPicker
          subtitulo="Emoji de la categoría"
          titulo={emojiPara.nombre}
          sugerido={emojiPara.emoji}
          actual={emojiPara.emoji}
          onSelect={(emoji) => aplicarEmoji(emojiPara, emoji)}
          onClose={() => setEmojiPara(null)}
        />
      )}
    </>
  );
}
