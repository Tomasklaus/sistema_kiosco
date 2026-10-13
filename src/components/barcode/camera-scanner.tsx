"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/**
 * Escáner de códigos de barras con la cámara (celular/tablet/webcam).
 * Requiere HTTPS (o localhost). Con `continuo` queda abierto para leer varios productos seguidos.
 */
export function CameraScanner({ onDetect, onClose, continuo = false }: {
  onDetect: (code: string) => void;
  onClose: () => void;
  continuo?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const detectRef = useRef(onDetect);
  const closeRef = useRef(onClose);
  useEffect(() => { detectRef.current = onDetect; closeRef.current = onClose; }, [onDetect, onClose]);

  useEffect(() => {
    let detenido = false;
    let controles: { stop: () => void } | null = null;
    let ultimo = { code: "", t: 0 };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador no permite usar la cámara (se necesita HTTPS).");
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } },
          videoRef.current!,
          (result) => {
            if (!result || detenido) return;
            const code = result.getText();
            const ahora = Date.now();
            // Evita leer 20 veces seguidas el mismo código mientras sigue frente a la cámara.
            if (code === ultimo.code && ahora - ultimo.t < 2000) { ultimo.t = ahora; return; }
            ultimo = { code, t: ahora };
            if (navigator.vibrate) navigator.vibrate(60);
            detectRef.current(code);
            if (!continuo) closeRef.current();
          }
        );
        if (detenido) c.stop(); else { controles = c; setListo(true); }
      } catch (e) {
        const msg = e instanceof Error ? e.name : "";
        setError(
          msg === "NotAllowedError" ? "Permiso de cámara denegado. Habilitalo desde el candado de la barra de direcciones."
          : msg === "NotFoundError" ? "No se encontró ninguna cámara en este dispositivo."
          : "No se pudo iniciar la cámara."
        );
      }
    })();

    return () => { detenido = true; controles?.stop(); };
  }, [continuo]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" role="dialog" aria-label="Escáner con cámara">
      <div className="panel w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="flex items-center gap-2 font-semibold"><Camera className="size-4 text-emerald-400" /> Escanear con cámara</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="size-5" /></button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} className="size-full object-cover" muted playsInline />
          {listo && (
            <div className="pointer-events-none absolute inset-x-[10%] inset-y-[30%] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,.45)]">
              <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-red-500/80" />
            </div>
          )}
          {!listo && !error && <p className="absolute inset-0 grid place-items-center text-sm text-slate-400">Iniciando cámara...</p>}
          {error && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-red-300">{error}</p>}
        </div>
        <p className="px-4 py-3 text-center text-xs text-slate-500">
          {continuo ? "Modo continuo: apuntá a cada código, se suma al ticket." : "Apuntá el código de barras al recuadro."}
        </p>
      </div>
    </div>
  );
}
