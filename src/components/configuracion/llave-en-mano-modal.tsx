"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, CreditCard, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Número de WhatsApp comercial del servicio "Llave en Mano".
 * Formato internacional sin "+" ni espacios (ej: 5492664000000).
 * TODO: reemplazar por el número real del negocio antes de publicar.
 */
const WHATSAPP_LLAVE_EN_MANO = "5492664000000";

const MENSAJE_WHATSAPP =
  "¡Hola! Quiero contratar el Servicio \"Llave en Mano\" del Kiosco POS (carga de catálogo, lector y capacitación). ¿Me pasan los pasos?";

/** Pago único promocional del servicio asistido (ARS). */
export const PRECIO_LLAVE_EN_MANO = 40000;

export function urlWhatsappLlaveEnMano() {
  return `https://wa.me/${WHATSAPP_LLAVE_EN_MANO}?text=${encodeURIComponent(MENSAJE_WHATSAPP)}`;
}

const opcionCls =
  "flex w-full items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/5 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

/**
 * Modal de contratación del servicio opcional "Llave en Mano":
 * abre WhatsApp con el mensaje pre-cargado o inicia el pago único.
 */
export function LlaveEnManoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loadingPago, setLoadingPago] = useState(false);

  // Escape cierra el modal y se bloquea el scroll del body mientras está abierto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const pedirPago = () => {
    setLoadingPago(true);
    toast.info("Preparando el pago único del Servicio Llave en Mano...");
    setTimeout(() => {
      // Reemplazar con el checkout de pago único de Mercado Pago / PayPal
      window.location.href = "https://www.mercadopago.com.ar/checkout/v1/redirect";
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Solicitar Servicio Llave en Mano"
      onClick={onClose}
    >
      <div
        className="panel pop my-auto w-full max-w-lg border-cyan-500/30 bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              PAGO ÚNICO · ASISTENCIA TOTAL
            </span>
            <h3 className="text-lg font-bold text-white">Servicio &quot;Llave en Mano&quot;</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-slate-300">
            Cargamos tu catálogo, configuramos tu lector y te capacitamos en vivo para que empieces
            a vender de inmediato. Elegí cómo querés empezar:
          </p>

          <a
            href={urlWhatsappLlaveEnMano()}
            target="_blank"
            rel="noopener noreferrer"
            className={opcionCls}
            onClick={() => toast.success("Abriendo WhatsApp para coordinar la carga de tu catálogo")}
          >
            <span className="rounded-lg bg-emerald-500/20 p-2.5 text-emerald-400">
              <MessageCircle className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">Coordinar por WhatsApp</span>
              <span className="block text-xs text-slate-400">
                Te respondemos a la brevedad para agendar la presencial en San Luis o la sesión remota por AnyDesk.
              </span>
            </span>
          </a>

          <button type="button" onClick={pedirPago} disabled={loadingPago} className={opcionCls}>
            <span className="rounded-lg bg-sky-500/20 p-2.5 text-sky-400">
              {loadingPago ? <Loader2 className="size-5 animate-spin" /> : <CreditCard className="size-5" />}
            </span>
            <span>
              <span className="block text-sm font-semibold text-white">
                {loadingPago ? "Conectando con el checkout..." : "Pagar online"}
              </span>
              <span className="block text-xs text-slate-400">
                Pago único de $40.000,00 ARS (o $30 USD desde el exterior). Coordinamos el trabajo después del pago.
              </span>
            </span>
          </button>

          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            Servicio opcional: tu suscripción mensual funciona igual sin contratarlo.
          </div>

          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <CheckCircle2 className="size-3.5" />
            Cupos de asistencia limitados por semana.
          </p>
        </div>
      </div>
    </div>
  );
}
