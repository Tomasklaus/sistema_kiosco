"use client";
import { useEffect, useRef } from "react";

/**
 * Detecta lectores de código de barras (teclado HID): ráfaga rápida de teclas + Enter.
 * No requiere input enfocado.
 */
export function useBarcodeScanner(onScan: (code: string) => void, maxGapMs = 40, minLength = 4) {
  const buffer = useRef("");
  const last = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const now = Date.now();
      if (now - last.current > maxGapMs) buffer.current = "";
      last.current = now;

      if (e.key === "Enter") {
        if (buffer.current.length >= minLength) {
          if (typing) e.preventDefault();
          onScan(buffer.current);
        }
        buffer.current = "";
      } else if (e.key.length === 1) {
        buffer.current += e.key;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScan, maxGapMs, minLength]);
}
