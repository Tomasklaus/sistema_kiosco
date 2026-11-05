"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Building2, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  PauseCircle,
  Save, 
  Handshake, 
  Banknote, 
  BookUser,
  ExternalLink,
  Sparkles,
  Rocket,
  BadgePercent,
  Check,
  Globe,
  Wand2,
  Images,
  ScanBarcode,
  GraduationCap,
  Headset,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  actualizarDatosNegocio,
  actualizarMetodosPagoNegocio,
  iniciarSuscripcionMercadoPago,
  iniciarSuscripcionPayPal,
  METODOS_PAGO_DEFAULT,
  type MetodosPagoNegocio,
  type NegocioConfig,
  type SuscripcionInfo,
} from "@/actions/configuracion";
import { LlaveEnManoModal } from "@/components/configuracion/llave-en-mano-modal";
import { formatARS } from "@/lib/utils";

// ── Precios de lanzamiento (Plan Pioneros) ───────────────────────────────────
const PRECIO_REGULAR_ARS = 30000;
const PRECIO_PIONERO_ARS = 20000;
const PRECIO_REGULAR_USD = "$30.00";
const PRECIO_PIONERO_USD = "$20.00";

interface PlanSuscripcion {
  id: "mercadopago" | "paypal";
  nombre: string;
  regionLabel: string;
  Icono: LucideIcon;
  /** Borde y gradiente de la tarjeta */
  cardCls: string;
  /** Colores del badge de región */
  badgeCls: string;
  iconCls: string;
  /** Color de marca del proveedor para el CTA */
  ctaCls: string;
  precioRegular: string;
  precioPromocional: string;
  unidad: string;
  subtexto: string;
  beneficios: string[];
}

const PLANES: PlanSuscripcion[] = [
  {
    id: "mercadopago",
    nombre: "Mercado Pago",
    regionLabel: "ARGENTINA (ARS)",
    Icono: Handshake,
    cardCls: "border-sky-500/30 bg-gradient-to-b from-sky-500/10 to-transparent",
    badgeCls: "bg-sky-500/20 border-sky-500/30 text-sky-300",
    iconCls: "text-sky-400",
    ctaCls: "bg-sky-500 hover:bg-sky-400 shadow-sky-500/20",
    precioRegular: `${formatARS(PRECIO_REGULAR_ARS)} ARS/mes`,
    precioPromocional: formatARS(PRECIO_PIONERO_ARS),
    unidad: "/ mes",
    subtexto: "Débito automático mensual con Mercado Pago (dinero en cuenta o tarjetas).",
    beneficios: [
      "Sin límite de productos ni lectores de código de barras",
      "Múltiples turnos y cajeros simultáneos",
      "Control de stock, caja diaria y cuentas corrientes (fiados)",
      "Actualización masiva de precios por categoría",
      "Cancelación libre en cualquier momento sin penalizaciones",
    ],
  },
  {
    id: "paypal",
    nombre: "PayPal",
    regionLabel: "INTERNACIONAL (USD)",
    Icono: Globe,
    cardCls: "border-blue-600/30 bg-gradient-to-b from-blue-600/10 to-transparent",
    badgeCls: "bg-blue-600/20 border-blue-600/30 text-blue-300",
    iconCls: "text-blue-400",
    ctaCls: "bg-[#0070ba] hover:bg-[#005ea6] shadow-blue-600/20",
    precioRegular: `${PRECIO_REGULAR_USD} USD/mes`,
    precioPromocional: PRECIO_PIONERO_USD,
    unidad: "USD / mes",
    subtexto: "Cobro internacional mediante tarjeta de crédito o balance PayPal.",
    beneficios: [
      "Facturación en dólares con respaldo PayPal",
      "Todas las funciones y reportes avanzados ilimitados",
      "Soporte prioritario y actualizaciones continuas sin costo",
      "Formato de moneda adaptable a tu país",
      "Cancelación libre con un clic desde tu cuenta",
    ],
  },
];

interface IncluidoLlaveEnMano {
  Icono: LucideIcon;
  texto: string;
}

const LLAVE_EN_MANO: {
  precioRegular: string;
  precioPromocional: string;
  precioExterior: string;
  descripcion: string;
  incluye: IncluidoLlaveEnMano[];
} = {
  precioRegular: formatARS(50000),
  precioPromocional: formatARS(40000),
  precioExterior: "$30 USD",
  descripcion:
    "Ideal si no tenés tiempo ni ganas de cargar tus productos a mano. Nos encargamos de todo el trabajo pesado para que empieces a vender de inmediato.",
  incluye: [
    { Icono: Images, texto: "Carga inicial de tu catálogo desde fotos de facturas o listas de proveedores" },
    { Icono: ScanBarcode, texto: "Configuración de tu lector de código de barras y accesos directos" },
    { Icono: GraduationCap, texto: "Acompañamiento en vivo y capacitación personalizada (Presencial en San Luis / Remoto vía Anydesk para el resto del país)" },
    { Icono: Headset, texto: "Soporte prioritario por WhatsApp directo durante tus primeros 10 días" },
  ],
};

export function ConfiguracionScreen({ 
  negocio, 
  suscripcion, 
  usuario 
}: { 
  negocio: NegocioConfig; 
  suscripcion: SuscripcionInfo; 
  usuario: { id: string; email: string; rol: string }; 
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"suscripcion" | "metodos_pago" | "negocio">("suscripcion");
  const [pending, startTransition] = useTransition();

  // Estados de carga para suscripciones
  const [loadingMp, setLoadingMp] = useState(false);
  const [loadingPp, setLoadingPp] = useState(false);
  // Modal del servicio opcional "Llave en Mano"
  const [modalLlave, setModalLlave] = useState(false);

  // Formulario negocio
  const [nombreNegocio, setNombreNegocio] = useState(negocio.nombre || "");

  // Métodos de cobro activos en el POS (persistidos en BD)
  const [metodos, setMetodos] = useState<MetodosPagoNegocio>(
    negocio.metodos_pago_activos ?? METODOS_PAGO_DEFAULT,
  );

  // Mostrar notificación al volver del checkout de Mercado Pago o PayPal
  useEffect(() => {
    const pago = searchParams.get("pago");
    if (!pago) return;
    if (pago === "mp_exito" || pago === "paypal_exito") {
      toast.success("¡Pago procesado con éxito! Tu suscripción se actualizará en instantes.");
    } else if (pago === "llave_exito") {
      toast.success("¡Pago del Servicio Llave en Mano recibido! Te contactaremos a la brevedad.");
    } else if (pago === "pendiente") {
      toast.info("Tu pago está pendiente de acreditación.");
    } else if (pago === "cancelado") {
      toast.warning("El proceso de pago fue cancelado.");
    }
  }, [searchParams]);

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

  const handleToggleMetodo = (clave: keyof MetodosPagoNegocio, valor: boolean) => {
    const nuevos: MetodosPagoNegocio = { ...metodos, [clave]: valor };
    if (!nuevos.efectivo && !nuevos.mercadopago && !nuevos.tarjeta && !nuevos.cuenta_corriente) {
      toast.error("Debés dejar al menos un método de cobro habilitado en el POS");
      return;
    }
    const previos = metodos;
    setMetodos(nuevos);
    startTransition(async () => {
      const res = await actualizarMetodosPagoNegocio(nuevos);
      if (!res.ok) {
        setMetodos(previos);
        toast.error(res.error || "No se pudo guardar la preferencia");
        return;
      }
      toast.success("Métodos de cobro del POS actualizados");
    });
  };

  const handleSuscribirMP = async () => {
    setLoadingMp(true);
    toast.info("Conectando con Mercado Pago...");
    try {
      const res = await iniciarSuscripcionMercadoPago();
      if (!res.ok || !res.data?.url) {
        toast.error(res.error || "No se pudo conectar con Mercado Pago");
        setLoadingMp(false);
        return;
      }
      window.location.href = res.data.url;
    } catch {
      toast.error("Error de red al conectar con Mercado Pago");
      setLoadingMp(false);
    }
  };

  const handleSuscribirPP = async () => {
    setLoadingPp(true);
    toast.info("Conectando con PayPal...");
    try {
      const res = await iniciarSuscripcionPayPal();
      if (!res.ok || !res.data?.url) {
        toast.error(res.error || "No se pudo conectar con PayPal");
        setLoadingPp(false);
        return;
      }
      window.location.href = res.data.url;
    } catch {
      toast.error("Error de red al conectar con PayPal");
      setLoadingPp(false);
    }
  };

  const vencidaPorFecha =
    (suscripcion.estado === "prueba" || suscripcion.estado === "activa") && !suscripcion.operativa;

  const estadoBadge = vencidaPorFecha
    ? {
        label: suscripcion.estado === "prueba" ? "Prueba gratis vencida" : "Suscripción vencida",
        bg: "bg-red-500/20 text-red-400 border-red-500/30",
        icon: AlertCircle,
      }
    : {
        prueba: {
          label: `Prueba Gratis (${Math.max(0, suscripcion.dias_restantes)}d restantes)`,
          bg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
          icon: Sparkles,
        },
        activa: {
          label: "Activa",
          bg: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
          icon: CheckCircle2,
        },
        pausada: {
          label: "Pausada",
          bg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          icon: PauseCircle,
        },
        pendiente: {
          label: "Pendiente",
          bg: "bg-amber-500/20 text-amber-400 border-amber-500/30",
          icon: Clock,
        },
        inactiva: {
          label: "Sin suscripción activa",
          bg: "bg-slate-500/20 text-slate-400 border-slate-500/30",
          icon: AlertCircle,
        },
        cancelada: {
          label: "Cancelada",
          bg: "bg-red-500/20 text-red-400 border-red-500/30",
          icon: AlertCircle,
        },
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
          {/* Alerta si la suscripción / prueba está vencida o pausada */}
          {!suscripcion.operativa && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div>
                <p className="font-bold text-white">
                  {suscripcion.estado === "pausada"
                    ? "Tu suscripción se encuentra pausada"
                    : "Tu período de prueba de 7 días o suscripción ha vencido"}
                </p>
                <p className="mt-0.5 text-xs text-red-200/80">
                  Para seguir abriendo turnos y registrando ventas en el Punto de Venta, activá tu suscripción mensual con Mercado Pago o PayPal. Tus productos, clientes e historial siguen intactos.
                </p>
              </div>
            </div>
          )}

          {/* Banner: Plan Pioneros (oferta de lanzamiento) */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-950 bg-gradient-to-r from-amber-500/15 via-cyan-500/10 to-transparent p-5 sm:p-6">
            <Rocket className="pointer-events-none absolute -right-6 -top-6 size-32 text-amber-500/10" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-300">
                    <Rocket className="size-3.5" />
                    OFERTA DE LANZAMIENTO • PLAN PIONEROS (CUPOS LIMITADOS)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                    <BadgePercent className="size-3.5" />
                    33% OFF
                  </span>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-200">
                  Precio congelado a{" "}
                  <strong className="font-bold text-white">{formatARS(PRECIO_PIONERO_ARS)} ARS/mes</strong>{" "}
                  (Precio regular futuro:{" "}
                  <span className="line-through text-slate-500">{formatARS(PRECIO_REGULAR_ARS)} ARS/mes</span>
                  ). Garantía de tarifa fija mientras mantengas tu suscripción activa.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3.5 py-2.5 text-xs text-cyan-200">
                <ShieldCheck className="size-4 shrink-0 text-cyan-400" />
                7 días de prueba gratis incluidos
              </div>
            </div>
          </div>

          {/* Tarjeta de Estado Actual */}
          <div className="panel p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estado de tu cuenta</span>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${estadoBadge.bg}`}>
                  <BadgeIcon className="size-3.5" />
                  {estadoBadge.label}
                </span>
                <span className="text-lg font-bold text-white">{suscripcion.plan}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Usuario: <span className="text-slate-200">{usuario.email}</span> (Rol: {usuario.rol})
              </p>
            </div>

            {suscripcion.operativa ? (
              <div className="text-right">
                <span className="text-xs text-slate-400">
                  {suscripcion.estado === "prueba" ? "Fin de prueba gratis" : "Próximo vencimiento / renovación"}
                </span>
                <p className="text-sm font-semibold text-emerald-400">
                  {suscripcion.fecha_fin
                    ? `${new Date(suscripcion.fecha_fin).toLocaleDateString("es-AR")} (${Math.max(0, suscripcion.dias_restantes)} días)`
                    : "Automática mensual"}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-2 text-xs text-amber-200">
                <Sparkles className="size-4 shrink-0 text-amber-400" />
                Elegí Mercado Pago o PayPal abajo para activar tu cuenta de inmediato.
              </div>
            )}
          </div>

          {/* Opciones de Suscripción: Mercado Pago y PayPal */}
          <div className="grid gap-6 md:grid-cols-2">
            {PLANES.map((plan) => {
              const loading = plan.id === "mercadopago" ? loadingMp : loadingPp;
              const suscribir = plan.id === "mercadopago" ? handleSuscribirMP : handleSuscribirPP;
              const IconoProveedor = plan.id === "mercadopago" ? CreditCard : ExternalLink;

              return (
                <div key={plan.id} className={`panel p-6 relative flex flex-col justify-between ${plan.cardCls}`}>
                  <span className={`absolute top-3 right-3 rounded-full border px-3 py-0.5 text-[10px] font-bold ${plan.badgeCls}`}>
                    {plan.regionLabel}
                  </span>
                  <div>
                    <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                      <plan.Icono className={`size-6 ${plan.iconCls}`} />
                      {plan.nombre}
                    </h3>

                    {/* Anclaje de precio + precio promocional del Plan Pioneros */}
                    <div className="mt-4 space-y-1">
                      <span className="block text-xs font-medium line-through text-slate-500">
                        {plan.precioRegular}
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-3xl font-extrabold text-white sm:text-4xl">{plan.precioPromocional}</span>
                        <span className="text-xs text-slate-400">{plan.unidad}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-slate-400">{plan.subtexto}</p>

                    <ul className="mt-6 space-y-2.5 text-xs text-slate-300">
                      {plan.beneficios.map((beneficio) => (
                        <li key={beneficio} className="flex items-start gap-2">
                          <Check className={`mt-0.5 size-3.5 shrink-0 ${plan.iconCls}`} />
                          <span>{beneficio}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => void suscribir()}
                    disabled={loading}
                    className={`mt-8 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold shadow-lg transition active:scale-[0.98] disabled:opacity-50 ${plan.ctaCls}`}
                  >
                    <IconoProveedor className="size-4" />
                    {loading
                      ? "Conectando..."
                      : plan.id === "mercadopago"
                        ? "Suscribirme con Mercado Pago"
                        : "Suscribirme con PayPal"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Servicio opcional "Llave en Mano" (pago único) */}
          <div className="panel relative overflow-hidden border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-cyan-500/5 to-transparent p-6">
            <Wand2 className="pointer-events-none absolute -bottom-8 -left-8 size-40 text-cyan-500/5" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-stretch">
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-cyan-300">
                      PAGO ÚNICO
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-emerald-300">
                      ASISTENCIA TOTAL
                    </span>
                  </div>
                  <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                    <Wand2 className="size-6 text-cyan-400" />
                    Servicio &quot;Llave en Mano&quot; <span className="text-sm font-medium text-slate-400">(Opcional)</span>
                  </h3>
                </div>

                <p className="max-w-2xl text-xs leading-relaxed text-slate-400">{LLAVE_EN_MANO.descripcion}</p>

                <ul className="grid gap-2.5 text-xs text-slate-300 sm:grid-cols-2">
                  {LLAVE_EN_MANO.incluye.map(({ Icono, texto }) => (
                    <li key={texto} className="flex items-start gap-2">
                      <Icono className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                      <span>{texto}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex shrink-0 flex-col justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/60 p-5 lg:w-72">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Pago único
                  </span>
                  <span className="mt-1 block text-xs font-medium line-through text-slate-500">
                    {LLAVE_EN_MANO.precioRegular} ARS
                  </span>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="text-3xl font-extrabold text-white">{LLAVE_EN_MANO.precioPromocional}</span>
                    <span className="text-xs text-slate-400">ARS</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Exterior: <span className="font-semibold text-slate-300">{LLAVE_EN_MANO.precioExterior}</span>
                  </p>
                </div>

                <button
                  onClick={() => setModalLlave(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 active:scale-[0.98]"
                >
                  <Wand2 className="size-4" />
                  Solicitar Servicio Llave en Mano
                </button>
              </div>
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
              Seleccioná las formas de pago que tus cajeros podrán registrar en el Punto de Venta (POS). Se guardan automáticamente para todo tu negocio.
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
                disabled={pending}
                onChange={(e) => handleToggleMetodo("efectivo", e.target.checked)}
                className="size-5 accent-emerald-500 cursor-pointer disabled:opacity-50"
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
                disabled={pending}
                onChange={(e) => handleToggleMetodo("mercadopago", e.target.checked)}
                className="size-5 accent-emerald-500 cursor-pointer disabled:opacity-50"
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
                disabled={pending}
                onChange={(e) => handleToggleMetodo("tarjeta", e.target.checked)}
                className="size-5 accent-emerald-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Cuenta Corriente */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-400">
                  <BookUser className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Cuenta Corriente (&quot;Fiado&quot; / Saldo a favor)</h4>
                  <p className="text-xs text-slate-400">Asignar deuda o débito a clientes registrados (F5)</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={metodos.cuenta_corriente}
                disabled={pending}
                onChange={(e) => handleToggleMetodo("cuenta_corriente", e.target.checked)}
                className="size-5 accent-emerald-500 cursor-pointer disabled:opacity-50"
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

      {/* Modal de contratación del servicio "Llave en Mano" */}
      <LlaveEnManoModal open={modalLlave} onClose={() => setModalLlave(false)} />
    </div>
  );
}
