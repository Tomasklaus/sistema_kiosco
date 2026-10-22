"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Banknote, 
  BookUser, 
  Camera, 
  CreditCard, 
  Handshake, 
  Lock, 
  Minus, 
  Plus, 
  Pencil,
  Radio, 
  Scale,
  Search, 
  Trash2,
  Receipt,
  Grid
} from "lucide-react";
import { toast } from "sonner";
import { registrarVenta } from "@/actions/ventas";
import { abrirTurno } from "@/actions/caja";
import { cantidadItem, useCartItems, useCartStore } from "@/stores/cart-store";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { ProductoFormModal } from "@/components/inventario/producto-form-modal";
import { PesoModal } from "@/components/pos/peso-modal";
import { beepError, beepOk, buscarPorCodigo, normalizarCodigo } from "@/lib/barcode";
import { esPesable } from "@/lib/producto-ui";
import { textoDetalleLinea, textoStock } from "@/lib/pesables";
import { cn, formatARS, formatCantidad, parseNumeroPositivo } from "@/lib/utils";
import type { MetodoPago, ProductoUI } from "@/types";

const PAGOS: { id: MetodoPago; key: string; label: string; icon: typeof Banknote }[] = [
  { id: "efectivo", key: "F2", label: "Efectivo", icon: Banknote },
  { id: "mercadopago", key: "F3", label: "MercadoPago", icon: Handshake },
  { id: "tarjeta", key: "F4", label: "Tarjeta", icon: CreditCard },
  { id: "cuenta_corriente", key: "F5", label: "A cuenta", icon: BookUser },
];

const COLORES = [
  "from-red-500/25 to-red-500/5 border-red-400/30", "from-amber-500/25 to-amber-500/5 border-amber-400/30",
  "from-sky-500/25 to-sky-500/5 border-sky-400/30", "from-emerald-500/25 to-emerald-500/5 border-emerald-400/30",
  "from-violet-500/25 to-violet-500/5 border-violet-400/30", "from-pink-500/25 to-pink-500/5 border-pink-400/30",
  "from-green-500/25 to-green-500/5 border-green-400/30",
];

export function PosScreen({ productos, categorias = [], turnoAbierto, clientes, puedeEditar = false }: {
  productos: ProductoUI[];
  categorias?: { id: string; nombre: string }[];
  turnoAbierto: boolean;
  clientes: { id: string; nombre: string }[];
  /** Dueño/admin: pueden editar el producto directo desde el POS. */
  puedeEditar?: boolean;
}) {
  const router = useRouter();
  const [pending, startT] = useTransition();
  const start = (fn: () => Promise<unknown>) => startT(async () => { await fn(); });
  // Estado propio del cobro: la transición de React puede quedar "pendiente" por
  // un refresh de la página y trabar el botón sin motivos.
  const [cobrando, setCobrando] = useState(false);
  const cobrandoRef = useRef(false);
  const { add, setCantidad, remove, clear, total } = useCartStore();
  const items = useCartItems();
  const [query, setQuery] = useState("");
  const [pago, setPago] = useState<MetodoPago>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [fondo, setFondo] = useState("");
  const [flash, setFlash] = useState(false);
  const [camara, setCamara] = useState(false);
  const [lectura, setLectura] = useState(false);
  const [ultimo, setUltimo] = useState<string | null>(null);
  
  // Vista en móvil: "catalogo" (para agregar productos) o "ticket" (para cobrar)
  const [vistaMobile, setVistaMobile] = useState<"catalogo" | "ticket">("catalogo");

  // Edición rápida del producto desde el POS (dueño/admin)
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Producto pesable que se está pesando (modal de kg/gramos)
  const [pesando, setPesando] = useState<{ producto: ProductoUI; kg: number | null } | null>(null);
  
  const searchRef = useRef<HTMLInputElement>(null);

  const totalVenta = total();
  const cantidadItems = items.reduce((a, b) => a + cantidadItem(b), 0);
  const recibidoNum = parseNumeroPositivo(recibido);
  const vuelto = pago === "efectivo" ? Math.max(0, recibidoNum - totalVenta) : 0;
  const falta = recibidoNum < totalVenta;
  const favoritos = productos.filter((p) => p.acceso_rapido);

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? productos.filter((x) => x.nombre.toLowerCase().includes(q)) : productos;
  }, [query, productos]);

  const agregar = useCallback((prod: ProductoUI, cant = 1) => {
    if (esPesable(prod)) {
      // Los pesables no se agregan "de a uno": se abre el modal de peso.
      setPesando({ producto: prod, kg: null });
      return false;
    }
    add(prod, cant);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    return true;
  }, [add]);

  /** Confirma el peso: agrega la línea nueva o reemplaza los kg de la existente. */
  const confirmarPeso = (kg: number) => {
    if (!pesando) return;
    const existente = items.find((i) => i.producto.id === pesando.producto.id);
    if (existente) setCantidad(pesando.producto.id, kg);
    else add(pesando.producto, kg);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    setUltimo(pesando.producto.nombre);
    setVistaMobile("ticket");
  };

  const onScan = useCallback((raw: string) => {
    const code = normalizarCodigo(raw);
    setQuery("");
    setLectura(true);
    setTimeout(() => setLectura(false), 400);
    const prod = buscarPorCodigo(productos, code);
    if (!prod) {
      beepError();
      setUltimo(null);
      toast.error(`Código ${code} no encontrado`, {
        action: { label: "Crear producto", onClick: () => router.push(`/inventario?codigo=${encodeURIComponent(code)}`) },
      });
      return;
    }
    beepOk();
    // Los pesables abren el modal de kg/gramos (el escaneo sólo identifica el producto).
    agregar(prod);
    setUltimo(prod.nombre);
    if (prod.stock <= 0) toast.warning(`${prod.nombre} figura sin stock`);
  }, [agregar, productos, router]);

  useBarcodeScanner(onScan, { enabled: turnoAbierto && !camara });

  const buscarEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !query.trim()) return;
    const porCodigo = buscarPorCodigo(productos, query);
    const unico = lista.length === 1 ? lista[0] : undefined;
    const prod = porCodigo ?? unico;
    if (prod) { agregar(prod); setUltimo(prod.nombre); setQuery(""); }
  };

  const cobrar = useCallback(async () => {
    // Candado síncrono: `pending` llega tarde si se hace doble clic o se aprieta
    // F9 dos veces, y la venta se registraría (y descontaría stock) dos veces.
    if (cobrandoRef.current) return;
    if (!items.length) return toast.error("El ticket está vacío");
    if (pago === "efectivo" && recibido && falta) return toast.error("El monto recibido no alcanza");
    if (pago === "cuenta_corriente" && !clienteId) return toast.error("Elegí un cliente para la venta a cuenta");

    cobrandoRef.current = true;
    setCobrando(true);
    try {
      // Sólo la cantidad comprada de cada producto: nunca precios ni totales.
      const payload = items.map((i) => ({
        producto_id: i.producto.id,
        cantidad: cantidadItem(i),
      }));
      const res = await registrarVenta(
        payload,
        pago,
        pago === "efectivo" && recibido ? parseNumeroPositivo(recibido) : undefined,
        pago === "cuenta_corriente" ? clienteId : undefined
      );
      if (!res.ok) return toast.error(res.error ?? "No se pudo registrar la venta");
      toast.success(`Venta cobrada ${formatARS(totalVenta)}`);
      clear(); 
      setRecibido(""); 
      setClienteId("");
      setVistaMobile("catalogo");
      router.refresh();
    } catch (e) {
      // Sin esto, un error de red dejaba la venta "en curso" para siempre.
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la venta");
    } finally {
      cobrandoRef.current = false;
      setCobrando(false);
    }
  }, [items, pago, recibido, falta, clienteId, totalVenta, clear, router]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const map: Record<string, MetodoPago> = { F2: "efectivo", F3: "mercadopago", F4: "tarjeta", F5: "cuenta_corriente" };
      if (e.key === "F1") { e.preventDefault(); searchRef.current?.focus(); }
      if (map[e.key]) { e.preventDefault(); setPago(map[e.key]); }
      // Si ya se está cobrando (o el foco está en un input), F9 no hace nada.
      if (e.key === "F9") {
        e.preventDefault();
        if (cobrandoRef.current || !turnoAbierto) return;
        void cobrar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cobrar, turnoAbierto]);


  if (!turnoAbierto) {
    return (
      <div className="grid h-full place-items-center py-10 px-4">
        <div className="panel w-full max-w-sm space-y-4 p-6 text-center">
          <Lock className="mx-auto size-10 text-emerald-400" />
          <h2 className="text-xl font-bold">No hay turno de caja abierto</h2>
          <p className="text-sm text-slate-400">Abrí el turno con el efectivo inicial para empezar a vender.</p>
          <input 
            value={fondo} 
            onChange={(e) => setFondo(e.target.value.replace(/[^\d.,]/g, ""))} 
            placeholder="Fondo inicial (ej: 10000)"
            inputMode="decimal"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-center text-lg outline-none focus:border-emerald-400" 
          />
          <button 
            disabled={pending}
            onClick={() => start(async () => {
              const r = await abrirTurno(parseNumeroPositivo(fondo));
              if (!r.ok) return toast.error(r.error);
              toast.success("Turno abierto"); router.refresh();
            })}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3 font-bold text-slate-950 disabled:opacity-50"
          >
            Abrir turno
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Selector móvil de vista Catálogo / Ticket */}
      <div className="flex md:hidden rounded-xl border border-white/10 bg-white/5 p-1 gap-1">
        <button
          onClick={() => setVistaMobile("catalogo")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition",
            vistaMobile === "catalogo" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
          )}
        >
          <Grid className="size-4" /> Productos ({productos.length})
        </button>
        <button
          onClick={() => setVistaMobile("ticket")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition",
            vistaMobile === "ticket" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
          )}
        >
          <Receipt className="size-4" /> Ticket ({cantidadItems}) · {formatARS(totalVenta)}
        </button>
      </div>

      {/* Grid principal responsivo */}
      <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_390px] gap-4">
        {/* SECCIÓN 1: CATÁLOGO Y BÚSQUEDA */}
        <section className={cn(
          "flex min-h-0 flex-col gap-3",
          vistaMobile === "ticket" && "hidden md:flex"
        )}>
          {/* Barra de búsqueda, lector y cámara */}
          <div className="panel flex flex-wrap sm:flex-nowrap items-center gap-2.5 p-3">
            <Search className="size-4.5 text-slate-500 shrink-0" />
            <input 
              ref={searchRef} 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              onKeyDown={buscarEnter}
              placeholder="Buscar producto o escanear..."
              className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-slate-500" 
            />
            
            <div className="flex items-center gap-2 ml-auto">
              {ultimo && (
                <span className="hidden xl:inline max-w-36 truncate text-[11px] text-slate-400">
                  Último: <b className="text-slate-200">{ultimo}</b>
                </span>
              )}
              
              <button 
                onClick={() => setCamara(true)} 
                title="Escanear con la cámara del dispositivo"
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-emerald-400/50 hover:text-emerald-300"
              >
                <Camera className="size-3.5" /> <span className="hidden sm:inline">CÁMARA</span>
              </button>

              <span className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition shrink-0",
                lectura ? "scale-105 bg-emerald-400 text-slate-950" : "bg-emerald-500/15 text-emerald-400"
              )}>
                <Radio className="size-3 animate-pulse" /> {lectura ? "LEÍDO" : "LECTOR"}
              </span>
            </div>
          </div>

          {/* Favoritos / Acceso rápido */}
          {favoritos.length > 0 && (
            <div className="panel p-3 sm:p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Favoritos / Acceso rápido</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {favoritos.slice(0, 8).map((p, i) => (
                  <button 
                    key={p.id} 
                    onClick={() => agregar(p)}
                    className={cn(
                      "group relative flex h-14 sm:h-16 flex-col justify-between rounded-xl border bg-gradient-to-br p-2 text-left text-xs sm:text-sm font-medium transition hover:-translate-y-0.5 active:scale-95", 
                      COLORES[i % COLORES.length]
                    )}
                  >
                    {puedeEditar && (
                      <span role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setEditandoId(p.id); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setEditandoId(p.id); }
                        }}
                        title="Editar producto" aria-label={`Editar ${p.nombre}`}
                        className="absolute right-1 top-1 rounded-md bg-black/50 p-1 text-white/70 opacity-0 transition hover:bg-emerald-500/30 hover:text-emerald-200 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Pencil className="size-3" />
                      </span>
                    )}
                    <span className="text-base sm:text-lg leading-none">{p.emoji}</span>
                    <span className="truncate">{p.nombre}</span>
                    {esPesable(p) && (
                      <span className="absolute bottom-1 right-1.5 text-[9px] font-bold uppercase tracking-wide text-emerald-200/80">
                        {formatARS(p.precio_venta)}/kg
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grilla de productos con scroll */}
          <div className="panel scroll-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {lista.map((prod) => (
                <button 
                  key={prod.id} 
                  onClick={() => agregar(prod)}
                  className="group relative flex flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-2.5 sm:p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-400/40 active:scale-[0.97]"
                >
                  <span className="flex items-start justify-between gap-1">
                    {puedeEditar && (
                      <span role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); setEditandoId(prod.id); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setEditandoId(prod.id); }
                        }}
                        title="Editar producto"
                        className="rounded-md bg-black/50 p-1 text-slate-400 opacity-0 transition hover:bg-emerald-500/20 hover:text-emerald-300 focus:opacity-100 group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </span>
                    )}
                    <span className={cn(
                      "ml-auto rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-mono",
                      prod.stock <= prod.stock_minimo ? "text-red-400" : "text-slate-400"
                    )}>
                      Stock: {textoStock(prod.stock, prod.unidad_venta)}
                    </span>
                  </span>
                  
                  <div className="grid h-16 sm:h-20 place-items-center text-4xl sm:text-5xl transition group-hover:scale-110">
                    {prod.emoji}
                  </div>
                  
                  <div className="mt-1">
                    <p className="text-xs sm:text-sm font-medium truncate">{prod.nombre}</p>
                    <p className="font-bold text-emerald-400 text-xs sm:text-sm">
                      {formatARS(prod.precio_venta)}
                      {esPesable(prod) && (
                        <span className="ml-0.5 text-[10px] font-semibold text-emerald-300/80">/kg</span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
              {!lista.length && (
                <p className="col-span-full py-12 text-center text-sm text-slate-500">
                  {productos.length ? "Sin resultados para tu búsqueda." : "Todavía no hay productos. Cargalos desde Inventario."}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* SECCIÓN 2: TICKET DE VENTA Y COBRO */}
        <aside className={cn(
          "flex min-h-0 flex-col gap-3",
          vistaMobile === "catalogo" && "hidden md:flex"
        )}>
          {/* El ticket */}
          <div className="panel flex min-h-0 flex-1 flex-col p-3 sm:p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-emerald-400" />
                <h2 className="font-semibold text-sm">El Ticket ({cantidadItems})</h2>
              </div>
              {items.length > 0 && (
                <button onClick={clear} className="text-slate-400 hover:text-red-400 text-xs flex items-center gap-1 transition">
                  <Trash2 className="size-3.5" /> Vaciar
                </button>
              )}
            </div>

            <div className="ticket scroll-thin min-h-[140px] flex-1 overflow-y-auto px-3 pb-5 pt-3">
              {!items.length && (
                <div className="py-10 text-center text-xs text-slate-400 space-y-1">
                  <p>El ticket está vacío.</p>
                  <p className="text-[11px] text-slate-500">Elegí productos del catálogo o pasalos por el lector.</p>
                </div>
              )}
              {items.map((item) => {
                const { producto, cantidad } = item;
                const kg = esPesable(producto);
                const subtotal = Math.round(producto.precio_venta * cantidad * 100) / 100;
                return (
                  <div key={producto.id} className="pop flex items-center gap-2 border-t border-dashed border-slate-300 py-2">
                    {kg ? (
                      // Pesable: se ajusta el peso (no "un clic más"): botón de balanza.
                      <button onClick={() => setPesando({ producto, kg: cantidad })}
                        title="Cambiar el peso" aria-label={`Cambiar el peso de ${producto.nombre}`}
                        className="flex shrink-0 items-center gap-1 rounded-md bg-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-800 hover:bg-slate-300">
                        <Scale className="size-3" /> {formatCantidad(cantidad)} kg
                      </button>
                    ) : (
                      <div className="flex items-center rounded-md bg-slate-200 text-xs font-bold text-slate-800">
                        <button onClick={() => setCantidad(producto.id, cantidad - 1)} className="px-1.5 py-1 hover:bg-slate-300 rounded-l" aria-label="Menos"><Minus className="size-3" /></button>
                        <span className="min-w-4 text-center text-[11px]">{cantidad}</span>
                        <button onClick={() => setCantidad(producto.id, cantidad + 1)} className="px-1.5 py-1 hover:bg-slate-300 rounded-r" aria-label="Más"><Plus className="size-3" /></button>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold leading-tight">{producto.nombre}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{textoDetalleLinea(producto, cantidad)}</p>
                    </div>
                    <span className="text-xs font-bold whitespace-nowrap">{formatARS(subtotal)}</span>
                    <button onClick={() => remove(producto.id)} className="text-slate-400 hover:text-red-500 p-1" aria-label="Quitar"><Trash2 className="size-3.5" /></button>
                  </div>
                );
              })}
            </div>

            {/* Total general */}
            <div className="mt-3 text-center">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total a cobrar</span>
              <p className={cn("glow-total text-3xl sm:text-4xl font-extrabold tracking-tight transition", flash && "scale-105")}>
                {formatARS(totalVenta)}
              </p>
            </div>

            {/* Selector de métodos de pago */}
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PAGOS.map(({ id, key, label, icon: Icon }) => (
                <button 
                  key={id} 
                  onClick={() => setPago(id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] font-semibold transition active:scale-95",
                    pago === id ? "border-emerald-400 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                  )}
                >
                  <Icon className="size-3.5" /> 
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Panel de cobro, cálculo de vuelto y botón de acción */}
          <div className="panel p-3 space-y-2.5">
            {pago === "cuenta_corriente" ? (
              <select 
                value={clienteId} 
                onChange={(e) => setClienteId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs outline-none focus:border-emerald-400 text-white"
              >
                <option value="">Elegí el cliente fiado...</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <label className="flex-1 text-[11px] text-slate-400 font-medium">
                  Paga con:
                  <input 
                    value={recibido} 
                    onChange={(e) => setRecibido(e.target.value.replace(/[^\d.,]/g, ""))}
                    disabled={pago !== "efectivo"} 
                    placeholder="$0" 
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-base font-bold text-white outline-none focus:border-emerald-400 disabled:opacity-40" 
                  />
                </label>
                <div className="pt-4 text-right">
                  <span className="text-[10px] text-slate-400 block">Vuelto:</span>
                  <b className={cn("text-lg", vuelto > 0 ? "text-emerald-400" : "text-slate-300")}>
                    {formatARS(vuelto)}
                  </b>
                </div>
              </div>
            )}

            <button 
              type="button"
              onClick={() => void cobrar()} 
              disabled={cobrando}
              aria-busy={cobrando}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3 font-extrabold text-slate-950 transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 text-sm shadow-lg shadow-emerald-500/20"
            >
              {cobrando ? "Procesando venta..." : `COBRAR (${formatARS(totalVenta)})`}
            </button>
          </div>
        </aside>
      </div>

      {camara && <CameraScanner continuo onDetect={onScan} onClose={() => setCamara(false)} />}

      {pesando && (
        <PesoModal
          producto={pesando.producto}
          cantidadInicial={pesando.kg}
          onConfirm={confirmarPeso}
          onClose={() => setPesando(null)}
        />
      )}

      {puedeEditar && editandoId && (() => {
        const producto = productos.find((p) => p.id === editandoId) ?? null;
        if (!producto) return null;
        return (
          <ProductoFormModal
            producto={producto}
            categorias={categorias}
            onClose={() => setEditandoId(null)}
            onSaved={() => router.refresh()}
          />
        );
      })()}
    </div>
  );
}
