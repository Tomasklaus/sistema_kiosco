"use client";

import { useState, useTransition } from "react";
import { 
  Building2, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Save, 
  Handshake, 
  Banknote, 
  BookUser,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { actualizarDatosNegocio, type NegocioConfig, type SuscripcionInfo } from "@/actions/configuracion";
import { formatARS } from "@/lib/utils";

export function ConfiguracionScreen({ 
  negocio, 
  suscripcion, 
  usuario 
}: { 
  negocio: NegocioConfig; 
  suscripcion: SuscripcionInfo; 
  usuario: { id: string; email: string; rol: string }; 
}) {
  const [tab, setTab] = useState<"suscripcion" | "metodos_pago" | "negocio">("suscripcion");
  const [pending, startTransition] = useTransition();

  // Estados de carga para suscripciones
  const [loadingMp, setLoadingMp] = useState(false);
  const [loadingPp, setLoadingPp] = useState(false);

  // Formulario negocio
  const [nombreNegocio, setNombreNegocio] = useState(negocio.nombre || "");

  // Métodos de cobro activos en el POS
  const [metodos, setMetodos] = useState({
    efectivo: true,
    mercadopago: true,
    tarjeta: true,
    cuenta_corriente: true,
  });

  const handleGuardarNegocio = () => {
    if (!nombreNegocio.trim()) return toast.error("El nombre del negocio no puede estar vacío");
    startTransition(async () => {
      const res = await actualizarDatosNegocio({ nombre: nombreNegocio });
      if (!res.ok) {
        toast.error(res.error || "Error al guardar");
        return;
      }
      toast.success("Datos del negocio actualizados");
    });
  };

  const handleSuscribirMP = () => {
    setLoadingMp(true);
    toast.info("Conectando con Mercado Pago...");
    setTimeout(() => {
      // Reemplazar con el checkout/preapproval de Mercado Pago
      window.location.href = "https://www.mercadopago.com.ar/subscriptions";
    }, 800);
  };

  const handleSuscribirPP = () => {
    setLoadingPp(true);
    toast.info("Conectando con PayPal...");
    setTimeout(() => {
      // Reemplazar con el plan de PayPal
      window.location.href = "https://www.paypal.com/billing/subscriptions";
    }, 800);
  };

  const estadoBadge = {
    activa: { label: "Activa", bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    pendiente: { label: "Pendiente", bg: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
    inactiva: { label: "Sin suscripción activa", bg: "bg-slate-500/20 text-slate-400 border-slate-500/30", icon: AlertCircle },
    cancelada: { label: "Cancelada", bg: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
  }[suscripcion.estado];

  const BadgeIcon = estadoBadge.icon;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <div>
        <h2 className="text-2xl font-bold text-white">Configuración del Sistema</h2>
        <p className="text-sm text-slate-400">
          Administrá tu plan de suscripción, métodos de pago aceptados y datos generales de tu kiosco.
        </p>
      </div>

      {/* Navegación por pestañas */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setTab("suscripcion")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "suscripcion"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <ShieldCheck className="size-4" />
          Suscripción & Planes
        </button>
        <button
          onClick={() => setTab("metodos_pago")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "metodos_pago"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <CreditCard className="size-4" />
          Métodos de Cobro (POS)
        </button>
        <button
          onClick={() => setTab("negocio")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "negocio"
              ? "border-emerald-400 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Building2 className="size-4" />
          Datos del Kiosco
        </button>
      </div>

      {/* TAB 1: SUSCRIPCIÓN */}
      {tab === "suscripcion" && (
        <div className="space-y-6">
          {/* Tarjeta de Estado Actual */}
          <div className="panel p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estado de tu cuenta</span>
              <div className="flex items-center gap-3 mt-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${estadoBadge.bg}`}>
                  <BadgeIcon className="size-3.5" />
                  {estadoBadge.label}
                </span>
                <span className="text-lg font-bold text-white">{suscripcion.plan}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Usuario principal: <span className="text-slate-200">{usuario.email}</span> (Rol: {usuario.rol})
              </p>
            </div>

            {suscripcion.estado === "activa" ? (
              <div className="text-right">
                <span className="text-xs text-slate-400">Próxima renovación</span>
                <p className="text-sm font-semibold text-emerald-400">
                  {suscripcion.fecha_fin ? new Date(suscripcion.fecha_fin).toLocaleDateString() : "Automática mensual"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-xs text-emerald-300">
                <Sparkles className="size-4 shrink-0 text-emerald-400" />
                Elegí una opción de pago mensual para mantener activas las funciones ilimitadas.
              </div>
            )}
          </div>

          {/* Opciones de Suscripción: Mercado Pago y PayPal */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Mercado Pago */}
            <div className="panel p-6 relative flex flex-col justify-between border-sky-500/30 bg-gradient-to-b from-sky-500/10 to-transparent">
              <span className="absolute top-3 right-3 rounded-full bg-sky-500/20 border border-sky-500/30 px-3 py-0.5 text-[10px] font-bold text-sky-300">
                ARGENTINA (ARS)
              </span>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Handshake className="size-6 text-sky-400" />
                  Mercado Pago
                </h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">{formatARS(15000)}</span>
                  <span className="text-xs text-slate-400">/ mes</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Débito automático mensual con dinero en cuenta o tarjetas.</p>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">✓ Sin límite de productos ni lectores de código</li>
                  <li className="flex items-center gap-2">✓ Múltiples turnos y cajeros simultáneos</li>
                  <li className="flex items-center gap-2">✓ Cuentas corrientes y saldo a favor de clientes</li>
                  <li className="flex items-center gap-2">✓ Cancelación libre en cualquier momento</li>
                </ul>
              </div>

              <button
                onClick={handleSuscribirMP}
                disabled={loadingMp}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50"
              >
                <CreditCard className="size-4" />
                {loadingMp ? "Conectando..." : "Suscribirme con Mercado Pago"}
              </button>
            </div>

            {/* PayPal */}
            <div className="panel p-6 relative flex flex-col justify-between border-blue-600/30 bg-gradient-to-b from-blue-600/10 to-transparent">
              <span className="absolute top-3 right-3 rounded-full bg-blue-600/20 border border-blue-600/30 px-3 py-0.5 text-[10px] font-bold text-blue-300">
                INTERNACIONAL (USD)
              </span>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <CreditCard className="size-6 text-blue-400" />
                  PayPal
                </h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">$15.00</span>
                  <span className="text-xs text-slate-400">USD / mes</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Cobro internacional mediante tarjeta de crédito o balance PayPal.</p>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-center gap-2">✓ Facturación en dólares con respaldo PayPal</li>
                  <li className="flex items-center gap-2">✓ Todas las funciones y reportes avanzados</li>
                  <li className="flex items-center gap-2">✓ Soporte prioritario y actualizaciones continuas</li>
                  <li className="flex items-center gap-2">✓ Cancelación con un clic desde tu cuenta</li>
                </ul>
              </div>

              <button
                onClick={handleSuscribirPP}
                disabled={loadingPp}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0070ba] py-3 text-sm font-bold text-white shadow-lg transition hover:bg-[#005ea6] active:scale-[0.98] disabled:opacity-50"
              >
                <ExternalLink className="size-4" />
                {loadingPp ? "Conectando..." : "Suscribirme con PayPal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MÉTODOS DE COBRO DEL POS */}
      {tab === "metodos_pago" && (
        <div className="panel p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white">Métodos de Cobro Habilitados en Caja</h3>
            <p className="text-xs text-slate-400 mt-1">
              Seleccioná las formas de pago que tus cajeros podrán registrar en el Punto de Venta (POS).
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Efectivo */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/20 p-2.5 text-emerald-400">
                  <Banknote className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Efectivo</h4>
                  <p className="text-xs text-slate-400">Cálculo de vuelto y control de caja física (F2)</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={metodos.efectivo}
                onChange={(e) => {
                  setMetodos({ ...metodos, efectivo: e.target.checked });
                  toast.success("Preferencia actualizada");
                }}
                className="size-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Mercado Pago */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sky-500/20 p-2.5 text-sky-400">
                  <Handshake className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Mercado Pago / Transferencia</h4>
                  <p className="text-xs text-slate-400">QR, transferencias y dinero en cuenta (F3)</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={metodos.mercadopago}
                onChange={(e) => {
                  setMetodos({ ...metodos, mercadopago: e.target.checked });
                  toast.success("Preferencia actualizada");
                }}
                className="size-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Tarjetas */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2.5 text-purple-400">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Tarjetas (Débito / Crédito)</h4>
                  <p className="text-xs text-slate-400">Posnet físico o terminal de pago (F4)</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={metodos.tarjeta}
                onChange={(e) => {
                  setMetodos({ ...metodos, tarjeta: e.target.checked });
                  toast.success("Preferencia actualizada");
                }}
                className="size-5 accent-emerald-500 cursor-pointer"
              />
            </div>

            {/* Cuenta Corriente */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-400">
                  <BookUser className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Cuenta Corriente ("Fiado" / Saldo a favor)</h4>
                  <p className="text-xs text-slate-400">Asignar deuda o débito a clientes registrados (F5)</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={metodos.cuenta_corriente}
                onChange={(e) => {
                  setMetodos({ ...metodos, cuenta_corriente: e.target.checked });
                  toast.success("Preferencia actualizada");
                }}
                className="size-5 accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATOS DEL KIOSCO */}
      {tab === "negocio" && (
        <div className="panel p-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-white">Datos de tu Kiosco</h3>
            <p className="text-xs text-slate-400 mt-1">
              Esta información identifica tu negocio en la barra superior y reportes del sistema.
            </p>
          </div>

          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre del Negocio</label>
              <input
                type="text"
                value={nombreNegocio}
                onChange={(e) => setNombreNegocio(e.target.value)}
                placeholder="Ej: Kiosco Don Pepe"
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">ID de la Empresa / Negocio</label>
              <input
                type="text"
                value={negocio.id}
                disabled
                className="w-full rounded-xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 font-mono text-xs text-slate-500 cursor-not-allowed"
              />
            </div>

            <button
              onClick={handleGuardarNegocio}
              disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="size-4" />
              {pending ? "Guardando..." : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
