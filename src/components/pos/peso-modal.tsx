"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Scale, X } from "lucide-react";
import {
  KG_INICIAL, PRESETS_KG, cantidadAKg, normalizarCantidadVenta, subtotalLinea, textoStock, type UnidadCarga,
} from "@/lib/pesables";
import { cn, formatARS, formatCantidad, parseNumero } from "@/lib/utils";
import type { ProductoUI } from "@/types";

/**
 * Modal de pesaje: se abre al tocar un producto pesable en el POS.
 *
 * Se puede cargar en kilos o en gramos (el cajero mira la balanza). Internamente
 * todo se convierte a kg con 3 decimales, que es lo que entiende la base.
 * Tiene atajos (100 g / 250 g / 500 g / 1 kg), muestra el total en vivo y avisa
 * si se supera el stock disponible (la venta se permite igual: el stock puede
 * quedar negativo, como en el resto del sistema).
 */
export function PesoModal({ producto, cantidadInicial, onConfirm, onClose }: {
  producto: ProductoUI;
  /** Peso precargado en kg (cuando se edita una línea existente del ticket). */
  cantidadInicial?: number | null;
  onConfirm: (kg: number) => void;
  onClose: () => void;
}) {
  const [unidad, setUnidad] = useState<UnidadCarga>("gr");
  const [valor, setValor] = useState<string>(() =>
    // En gramos, 0.250 kg → "250": el cajero escribe como lee la balanza.
    String(Math.round((cantidadInicial ?? KG_INICIAL) * 1000))
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const numero = parseNumero(valor) ?? 0;
  const kg = cantidadAKg(numero, unidad);
  // Se valida con las mismas reglas que la base (hasta 3 decimales, > 0).
  const kgValido = normalizarCantidadVenta("kg", kg);
  const total = subtotalLinea(producto.precio_venta, kgValido ?? 0);
  const excedeStock = kgValido !== null && kgValido > Number(producto.stock ?? 0);
  const faltante = Math.max(0, (kgValido ?? 0) - Number(producto.stock ?? 0));

  const confirmar = () => {
    if (kgValido === null) return;
    onConfirm(kgValido);
    onClose();
  };

  // Escape cierra y Enter agrega (el cajero no levanta las manos del teclado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        confirmar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const aplicarPreset = (presetKg: number) => {
    setUnidad("gr");
    setValor(String(Math.round(presetKg * 1000)));
    inputRef.current?.focus();
  };

  const cambiarUnidad = (nueva: UnidadCarga) => {
    if (nueva === unidad) return;
    // Se conserva el peso al cambiar de unidad para no perder la carga.
    setUnidad(nueva);
    setValor(kg > 0 ? String(nueva === "gr" ? Math.round(kg * 1000) : kg).replace(".", ",") : "");
    requestAnimationFrame(() => inputRef.current?.select());
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label={`Pesar ${producto.nombre}`} onClick={onClose}>
      <div className="panel pop w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-400/15 text-xl">
              {producto.emoji}
            </span>
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <Scale className="size-4 text-emerald-400" /> {producto.nombre}
              </h2>
              <p className="text-xs text-slate-400">
                {formatARS(producto.precio_venta)}/kg · stock {textoStock(Number(producto.stock ?? 0), "kg")}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {/* Unidad de carga: gramos (balanza) o kilos */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
            {([{ id: "gr" as const, label: "Gramos" }, { id: "kg" as const, label: "Kilos" }]).map((op) => (
              <button key={op.id} type="button" onClick={() => cambiarUnidad(op.id)}
                aria-pressed={unidad === op.id}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  unidad === op.id ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-white/5"
                )}>
                {op.label}
              </button>
            ))}
          </div>

          <label className="block text-[11px] font-medium text-slate-400">
            Peso
            <div className="mt-1 flex items-center gap-2">
              <input ref={inputRef} value={valor} inputMode="decimal" autoComplete="off"
                onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-2xl font-bold tabular-nums outline-none focus:border-emerald-400" />
              <span className="w-10 shrink-0 text-sm font-semibold text-slate-400">{unidad}</span>
            </div>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS_KG.map((p) => (
              <button key={p.label} type="button" onClick={() => aplicarPreset(p.kg)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  Math.abs(kg - p.kg) < 0.0005
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                )}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
            <div className="text-[11px] text-slate-400">
              {formatCantidad(kgValido ?? 0)} kg × {formatARS(producto.precio_venta)}
            </div>
            <div className="text-xl font-bold tabular-nums text-emerald-400">{formatARS(total)}</div>
          </div>

          {kgValido === null && (
            <p className="flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-400/10 px-2 py-1.5 text-[11px] text-red-300">
              <AlertTriangle className="size-3.5" /> Ingresá un peso mayor a 0 (mínimo 1 g).
            </p>
          )}

          {excedeStock && (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-200">
              <AlertTriangle className="size-3.5" />
              Supera el stock por {textoStock(faltante, "kg")}. Se puede vender igual y el stock queda negativo.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-4 py-3">
          <button onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">
            Cancelar
          </button>
          <button onClick={confirmar} disabled={kgValido === null}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
            Agregar {formatARS(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
