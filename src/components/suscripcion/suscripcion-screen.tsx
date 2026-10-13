"use client";

import { CreditCard, ShieldCheck } from "lucide-react";
import { useState } from "react";

export function SuscripcionScreen() {
  const [loadingMp, setLoadingMp] = useState(false);
  const [loadingPp, setLoadingPp] = useState(false);

  // Estas URLs deberán reemplazarse por el link de pago recurrente / botón de suscripción de MP/PP
  // o llamadas a una API interna tuya que genere el link.
  const handleSuscribirMP = () => {
    setLoadingMp(true);
    // Idealmente, llamar a tu backend: const url = await fetch("/api/mp-checkout")
    setTimeout(() => {
      window.location.href = "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=YOUR_PLAN_ID";
    }, 1000);
  };

  const handleSuscribirPP = () => {
    setLoadingPp(true);
    setTimeout(() => {
      window.location.href = "https://www.paypal.com/webapps/billing/subscriptions?ba_token=YOUR_BA_TOKEN";
    }, 1000);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="text-center space-y-4">
        <h2 className="text-3xl font-bold text-white flex justify-center items-center gap-3">
          <ShieldCheck className="size-8 text-emerald-400" />
          Plan Pro - Kiosco POS
        </h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Accede a todas las funcionalidades avanzadas: múltiples cajas, inventario ilimitado, panel de administración para todo tu equipo y reportes detallados.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 mt-12">
        {/* Mercado Pago */}
        <div className="rounded-2xl border border-blue-500/30 bg-[#161f36] p-8 shadow-2xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 bg-blue-500/20 px-4 py-1 rounded-bl-xl text-blue-400 text-xs font-bold">
            ARGENTINA
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Mercado Pago</h3>
          <div className="text-4xl font-extrabold text-white mb-6">$15.000 <span className="text-lg text-slate-400 font-normal">/mes</span></div>
          <ul className="space-y-3 text-sm text-slate-300 flex-1 mb-8">
            <li className="flex items-center gap-2">✓ Cobro automático mensual</li>
            <li className="flex items-center gap-2">✓ Cancela cuando quieras</li>
            <li className="flex items-center gap-2">✓ Tarjetas de crédito, débito o saldo</li>
          </ul>
          <button 
            onClick={handleSuscribirMP}
            disabled={loadingMp}
            className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CreditCard className="size-5" /> {loadingMp ? "Redirigiendo..." : "Suscribirme con MP"}
          </button>
        </div>

        {/* PayPal */}
        <div className="rounded-2xl border border-indigo-500/30 bg-[#161f36] p-8 shadow-2xl relative overflow-hidden flex flex-col">
          <div className="absolute top-0 right-0 bg-indigo-500/20 px-4 py-1 rounded-bl-xl text-indigo-400 text-xs font-bold">
            INTERNACIONAL
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">PayPal</h3>
          <div className="text-4xl font-extrabold text-white mb-6">$15.00 <span className="text-lg text-slate-400 font-normal">USD /mes</span></div>
          <ul className="space-y-3 text-sm text-slate-300 flex-1 mb-8">
            <li className="flex items-center gap-2">✓ Cobro automático mensual</li>
            <li className="flex items-center gap-2">✓ Cancela cuando quieras</li>
            <li className="flex items-center gap-2">✓ Protección al comprador</li>
          </ul>
          <button 
            onClick={handleSuscribirPP}
            disabled={loadingPp}
            className="w-full py-3 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CreditCard className="size-5" /> {loadingPp ? "Redirigiendo..." : "Suscribirme con PayPal"}
          </button>
        </div>
      </div>
    </div>
  );
}
