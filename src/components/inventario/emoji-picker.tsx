"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { EMOJIS_SUGERIDOS, normalizarEmoji } from "@/lib/producto-ui";
import { cn } from "@/lib/utils";

/**
 * Selector de emoji para un producto.
 * Grilla de íconos típicos de kiosco + campo libre para pegar cualquier emoji.
 * `onSelect(null)` quita el emoji propio y vuelve al sugerido por la categoría.
 */
export function EmojiPicker({ titulo, sugerido, actual, onSelect, onClose }: {
  titulo: string;
  /** Emoji que se mostrará si el producto queda sin emoji propio. */
  sugerido?: string | null;
  actual?: string | null;
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
}) {
  const [libre, setLibre] = useState(actual ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  // Cierre con Escape o clic fuera del panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const elegirLibre = () => {
    const emoji = normalizarEmoji(libre);
    if (!emoji) return;
    onSelect(emoji);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-label="Elegir emoji del producto">
      <div ref={ref} className="panel pop w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Emoji del producto</p>
            <p className="truncate text-xs text-slate-500">{titulo}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="size-5" /></button>
        </div>

        <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto scroll-thin p-3">
          {EMOJIS_SUGERIDOS.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => onSelect(emoji)}
              aria-label={`Usar ${emoji}`}
              className={cn(
                "grid aspect-square place-items-center rounded-lg text-xl transition hover:bg-white/10 active:scale-90",
                actual === emoji && "bg-emerald-500/20 ring-1 ring-emerald-400/60"
              )}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 p-3">
          <div className="flex items-center gap-2">
            <input
              value={libre}
              onChange={(e) => setLibre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") elegirLibre(); }}
              placeholder="Pegá otro emoji..."
              maxLength={8}
              aria-label="Emoji personalizado"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={elegirLibre}
              disabled={!normalizarEmoji(libre)}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50"
            >
              Usar
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            <RotateCcw className="size-3.5" />
            Usar el de la categoría {sugerido ? `(${sugerido})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
