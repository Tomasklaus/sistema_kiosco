"use client";
import { useEffect, useRef } from "react";
import { normalizarCodigo } from "@/lib/barcode";

type Opciones = {
  /** Pausa entre teclas (ms) por encima de la cual se considera tipeo humano. */
  maxGapMs?: number;
  /** Largo mínimo del código para considerarlo una lectura. */
  minLength?: number;
  /** Permite desactivar la escucha (ej. turno cerrado, modal abierto). */
  enabled?: boolean;
};

/**
 * Detecta lectores de código de barras (teclado HID): ráfaga rápida de teclas
 * terminada en Enter o Tab. No requiere input enfocado; si hay un input enfocado
 * se informa el elemento para que el llamador decida qué hacer.
 */
export function useBarcodeScanner(
  onScan: (code: string, el: HTMLElement | null) => void,
  { maxGapMs = 50, minLength = 4, enabled = true }: Opciones = {}
) {
  const buffer = useRef("");
  const last = useRef(0);
  const cb = useRef(onScan);
  useEffect(() => { cb.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      const now = Date.now();
      if (now - last.current > maxGapMs) buffer.current = "";
      last.current = now;

      if (e.key === "Enter" || e.key === "Tab") {
        const code = normalizarCodigo(buffer.current);
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          cb.current(code, target);
        }
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [maxGapMs, minLength, enabled]);
}
