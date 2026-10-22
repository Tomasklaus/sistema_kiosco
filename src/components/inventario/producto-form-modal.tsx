"use client";

import { useEffect, useState } from "react";
import { Camera, Link2, Save, Smile, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { actualizarProducto, crearProducto, eliminarProducto } from "@/actions/productos";
import { crearCategoria } from "@/actions/categorias";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { EmojiPicker } from "@/components/inventario/emoji-picker";
import { generarCodigoInterno, normalizarCodigo } from "@/lib/barcode";
import { METODOS_EGRESO, MOTIVOS_STOCK, type MetodoEgreso } from "@/lib/bitacora";
import {
  EMOJI_FALLBACK, EMOJI_POR_CATEGORIA, normalizarNombreCategoria, normalizarUnidadVenta, redondearStock,
} from "@/lib/producto-ui";
import { cn, formatARS, formatCantidad, parseNumeroPositivo } from "@/lib/utils";
import type { ProductoUI, UnidadVenta } from "@/types";

type Cat = { id: string; nombre: string };

export type FormProducto = {
  codigo: string; nombre: string; costo: string; venta: string;
  stock: string; minimo: string; cat: string; emoji: string; favorito: boolean;
  /** `"unit"` = por unidad, `"kg"` = por peso (migración 0010). */
  unidad: UnidadVenta;
};

/** Formulario en blanco; si se pasa un producto, precarga sus datos para editarlo. */
export function formDesdeProducto(p: ProductoUI | null, codigoInicial = ""): FormProducto {
  return {
    codigo: p?.codigo_barras ?? codigoInicial,
    nombre: p?.nombre ?? "",
    costo: p ? String(p.precio_costo) : "",
    venta: p ? String(p.precio_venta) : "",
    stock: p ? String(p.stock) : "",
    minimo: p ? String(p.stock_minimo) : "5",
    cat: p?.categoria_id ?? "",
    emoji: p?.emoji ?? "",
    favorito: p?.acceso_rapido ?? false,
    unidad: normalizarUnidadVenta(p?.unidad_venta),
  };
}

const inputCls = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-400";

/** Valor centinela del `<select>` de categoría para dar de alta una nueva. */
const NUEVA_CATEGORIA = "__nueva__";

/** Modal para crear o editar un producto con todos sus campos. */
export function ProductoFormModal({ producto, categorias, codigoInicial, ocultarCostos = false, onClose, onSaved }: {
  producto?: ProductoUI | null;
  categorias: Cat[];
  codigoInicial?: string;
  ocultarCostos?: boolean;
  onClose: () => void;
  onSaved?: (mensaje: string) => void;
}) {
  const editando = Boolean(producto?.id);
  const [form, setForm] = useState<FormProducto>(() => formDesdeProducto(producto ?? null, codigoInicial));
  const [guardando, setGuardando] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [camara, setCamara] = useState(false);
  const [borrar, setBorrar] = useState(false);
  // Categoría nueva escrita desde el propio formulario (se crea antes de guardar)
  const [catNueva, setCatNueva] = useState("");
  // Trazabilidad del cambio de stock (bitácora de caja, migración 0008)
  const [motivo, setMotivo] = useState<string>("");
  const [detalleStock, setDetalleStock] = useState("");
  const [referenciaStock, setReferenciaStock] = useState("");
  // ¿La reposición de mercadería estuvo vinculada con un egreso de caja?
  const [conEgreso, setConEgreso] = useState(false);
  const [sinCaja, setSinCaja] = useState(false);
  // De dónde salió la plata del egreso (migración 0011).
  const [metodoPago, setMetodoPago] = useState<MetodoEgreso>("efectivo");

  const set = (parcial: Partial<FormProducto>) => setForm((f) => ({ ...f, ...parcial }));

  const stockCambio = editando ? redondearStock(parseNumeroPositivo(form.stock) - Number(producto?.stock ?? 0)) : 0;
  const stockAumenta = stockCambio > 0;
  const motivoElegido = MOTIVOS_STOCK.find((m) => m.id === motivo);
  const afectaCaja = motivoElegido?.ingreso ? !sinCaja : conEgreso;
  // Producto pesable: el precio es por kg y el stock está en kg (3 decimales).
  const pesable = form.unidad === "kg";
  const sufijoStock = pesable ? "kg" : "u.";
  // Pasar de pesable a por unidad con stock decimal dejaría fracciones de
  // unidad imposibles de vender: se avisa antes de guardar.
  const stockDecimal = redondearStock(parseNumeroPositivo(form.stock)) % 1 !== 0;

  // Escape cierra el modal (salvo cuando hay un sub-modal abierto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !emojis && !camara) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [emojis, camara, onClose]);

  const sugerido = (form.cat && EMOJI_POR_CATEGORIA[categorias.find((c) => c.id === form.cat)?.nombre ?? ""]) || EMOJI_FALLBACK;
  const emojiMostrado = form.emoji || sugerido;
  const margen = parseNumeroPositivo(form.venta) > 0
    ? ((parseNumeroPositivo(form.venta) - parseNumeroPositivo(form.costo)) / parseNumeroPositivo(form.venta)) * 100
    : 0;

  const guardar = async () => {
    // Se impide un segundo envío mientras el primero está en curso (doble clic
    // duplicaría el producto // reenviaría el ajuste de stock).
    if (guardando) return;
    if (!form.nombre.trim()) return toast.error("El nombre es obligatorio");
    if (!form.venta || parseNumeroPositivo(form.venta) < 0) return toast.error("Ingresá un precio de venta válido");
    if (editando && stockCambio !== 0 && !motivo) {
      return toast.error("Indicá por qué cambió el stock: queda en la bitácora de caja");
    }
    if (!pesable && stockDecimal) {
      return toast.error("Un producto por unidad no puede tener stock con decimales: ajustá el stock");
    }

    setGuardando(true);

    // Si eligió "+ Nueva categoría…", la creamos primero y usamos su id
    let categoriaId: string | null = form.cat === NUEVA_CATEGORIA ? null : form.cat || null;
    if (form.cat === NUEVA_CATEGORIA) {
      const nombreCat = normalizarNombreCategoria(catNueva);
      if (!nombreCat) {
        setGuardando(false);
        return toast.error("Escribí el nombre de la categoría nueva");
      }
      const rc = await crearCategoria({ nombre: nombreCat });
      if (!rc.ok || !rc.data) {
        setGuardando(false);
        return toast.error(rc.error ?? "No se pudo crear la categoría");
      }
      categoriaId = rc.data.id;
      toast.success(`Categoría "${rc.data.nombre}" creada`);
    }

    const datos = {
      categoria_id: categoriaId,
      nombre: form.nombre,
      precio_costo: parseNumeroPositivo(form.costo),
      precio_venta: parseNumeroPositivo(form.venta),
      // La cantidad comprada/cargada, nunca un precio ni un total.
      stock: redondearStock(parseNumeroPositivo(form.stock)),
      stock_minimo: redondearStock(parseNumeroPositivo(form.minimo)),
      codigo_barras: form.codigo,
      emoji: form.emoji || null,
      acceso_rapido: form.favorito,
      unidad_venta: form.unidad,
    };
    const r = editando
      ? await actualizarProducto(producto!.id, datos, {
          motivo: motivo || undefined,
          detalle: detalleStock.trim() || undefined,
          referencia: referenciaStock.trim() || undefined,
          afecta_caja: afectaCaja,
          // Los pagos por transferencia / MP no descuentan el efectivo de la caja.
          metodo_pago: metodoPago,
        })
      : await crearProducto({ ...datos, codigo_barras: form.codigo });
    setGuardando(false);

    if (!r.ok) return toast.error(r.error ?? "Error al guardar");
    const mensaje = editando ? "Producto actualizado" : "Producto creado";
    toast.success(mensaje);
    onSaved?.(mensaje);
    onClose();
  };

  const confirmarBorrado = async () => {
    if (!producto || guardando) return;
    setGuardando(true);
    const r = await eliminarProducto(producto.id);
    setGuardando(false);
    if (!r.ok) return toast.error(r.error ?? "No se pudo dar de baja");
    toast.success("Producto dado de baja");
    onSaved?.("Producto dado de baja");
    onClose();
  };

  const autogenerarCodigo = () => {
    const codigo = generarCodigoInterno(producto?.codigo_barras ? [producto.codigo_barras] : []);
    set({ codigo });
    toast.success(`Código interno generado: ${codigo}`);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
        role="dialog" aria-label={editando ? "Editar producto" : "Nuevo producto"}>
        <div className="panel pop my-auto w-full max-w-lg">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{editando ? "Editar producto" : "Nuevo producto"}</p>
              <p className="truncate text-xs text-slate-500">{form.nombre || "Completá los datos del producto"}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-white"><X className="size-5" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-6">
            {/* Código + cámara + generador */}
            <div className="relative col-span-2 flex items-center sm:col-span-6">
              <input placeholder="Código de barras" value={form.codigo}
                onChange={(e) => set({ codigo: e.target.value })} className={cn(inputCls, "pr-16 font-mono")} />
              <div className="absolute right-1 flex items-center gap-1">
                <button type="button" onClick={() => setCamara(true)} title="Escanear con cámara"
                  className="rounded p-1 text-slate-400 hover:text-emerald-300"><Camera className="size-4" /></button>
                <button type="button" onClick={autogenerarCodigo} title="Generar código interno (EAN-13)"
                  className="rounded p-1 text-slate-400 hover:text-amber-300"><Sparkles className="size-4" /></button>
              </div>
            </div>

            {/* Nombre + emoji */}
            <input placeholder="Nombre del producto" value={form.nombre}
              onChange={(e) => set({ nombre: e.target.value })} className={cn(inputCls, "col-span-2 sm:col-span-5")} />
            <button type="button" onClick={() => setEmojis(true)} title="Elegir emoji del producto"
              className={cn(inputCls, "col-span-2 flex items-center justify-center gap-1.5 sm:col-span-1")}>
              <span className="text-lg leading-none">{emojiMostrado}</span>
              <Smile className="size-4 text-slate-400" />
            </button>

            {!ocultarCostos && (
              <label className="col-span-1 text-[11px] font-medium text-slate-400">
                Costo ($)
                <input placeholder="0" value={form.costo} inputMode="decimal"
                  onChange={(e) => set({ costo: e.target.value.replace(/[^\d.]/g, "") })}
                  className={cn(inputCls, "mt-1")} />
              </label>
            )}
            <label className={cn("col-span-1 text-[11px] font-medium text-slate-400", ocultarCostos && "col-span-2 sm:col-span-3")}>
              {pesable ? "Precio por Kg ($)" : "Venta ($)"}
              <input placeholder="0" value={form.venta} inputMode="decimal"
                onChange={(e) => set({ venta: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 text-[11px] font-medium text-slate-400">
              {pesable ? "Stock actual (Kg)" : "Stock"}
              <input placeholder="0" value={form.stock} inputMode="decimal"
                onChange={(e) => set({ stock: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 text-[11px] font-medium text-slate-400">
              {pesable ? "Mínimo (Kg)" : "Mínimo"}
              <input placeholder="5" value={form.minimo} inputMode="decimal"
                onChange={(e) => set({ minimo: e.target.value.replace(/[^\d.]/g, "") })}
                className={cn(inputCls, "mt-1")} />
            </label>

            {/* Tipo de venta: por unidad (kiosco) o por peso (fiambres, verduras) */}
            <div className="col-span-2">
              <p className="mb-1 text-[11px] font-medium text-slate-400">Tipo de venta</p>
              <div className="flex gap-2">
                {([
                  { id: "unit" as const, label: "Por unidad", hint: "Alfajor, gaseosa…" },
                  { id: "kg" as const, label: "Por peso", hint: "Queso, tomate… (se cobra por kg)" },
                ]).map((op) => (
                  <button key={op.id} type="button" onClick={() => set({ unidad: op.id })}
                    aria-pressed={form.unidad === op.id}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-left text-xs transition",
                      form.unidad === op.id
                        ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                        : "border-white/10 bg-black/20 text-slate-300 hover:bg-white/5"
                    )}>
                    <span className="block font-semibold">{op.label}</span>
                    <span className="block text-[10px] text-slate-400">{op.hint}</span>
                  </button>
                ))}
              </div>
              {!pesable && stockDecimal && (
                <p className="mt-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                  El stock tiene decimales. Un producto por unidad necesita un stock entero:
                  si querés venderlo por peso, elegí “Por peso”.
                </p>
              )}
            </div>

            <label className="col-span-2 text-[11px] font-medium text-slate-400">
              Categoría
              <select value={form.cat} onChange={(e) => {
                if (e.target.value === NUEVA_CATEGORIA) setCatNueva("");
                set({ cat: e.target.value });
              }} className={cn(inputCls, "mt-1")}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value={NUEVA_CATEGORIA}>+ Nueva categoría…</option>
              </select>
            </label>

            {/* Trazabilidad del stock: queda en la bitácora de caja del turno */}
            {editando && stockCambio !== 0 && (
              <div className="col-span-2 space-y-2 rounded-lg border border-sky-400/25 bg-sky-400/5 p-2.5 sm:col-span-6">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-200">
                  <Link2 className="size-3.5" />
                  {stockAumenta
                    ? `Ingreso de ${formatCantidad(Math.abs(stockCambio))} ${sufijoStock}`
                    : `Egreso de ${formatCantidad(Math.abs(stockCambio))} ${sufijoStock}`} de stock · queda en la bitácora
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[11px] font-medium text-slate-400">
                    Motivo
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cn(inputCls, "mt-1")}>
                      <option value="">Elegí el motivo…</option>
                      {MOTIVOS_STOCK.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[11px] font-medium text-slate-400">
                    Nº de comprobante (opcional)
                    <input value={referenciaStock} onChange={(e) => setReferenciaStock(e.target.value)}
                      placeholder="Ej. factura A-0001-123" className={cn(inputCls, "mt-1")} />
                  </label>
                </div>
                <input value={detalleStock} onChange={(e) => setDetalleStock(e.target.value)}
                  placeholder="Especificación: proveedor, qué llegó, observaciones…"
                  className={cn(inputCls, "w-full")} />
                <label className="flex items-center gap-2 text-[11px] text-slate-300">
                  <input type="checkbox"
                    checked={motivoElegido?.ingreso ? !sinCaja : conEgreso}
                    onChange={(e) => (motivoElegido?.ingreso ? setSinCaja(!e.target.checked) : setConEgreso(e.target.checked))}
                    className="size-4 accent-emerald-500" />
                  {stockAumenta
                    ? "La mercadería ingresó sin movimiento de caja (no hubo pago)"
                    : "El stock salió vinculado con un egreso de caja"}
                </label>

                {/* ¿Con qué se pagó la mercadería? (migración 0011) */}
                {afectaCaja && (
                  <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Método de pago de la compra
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {METODOS_EGRESO.map((m) => {
                        const activo = metodoPago === m.id;
                        return (
                          <button key={m.id} type="button" aria-pressed={activo}
                            onClick={() => setMetodoPago(m.id)} title={m.detalle}
                            className={cn(
                              "rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold transition",
                              activo
                                ? m.id === "efectivo"
                                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                                  : "border-sky-400/50 bg-sky-400/10 text-sky-200"
                                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10",
                            )}>
                            {m.label}
                            <span className="mt-0.5 block text-[10px] font-normal opacity-80">{m.detalle}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {form.cat === NUEVA_CATEGORIA && (
              <label className="col-span-2 text-[11px] font-medium text-slate-400">
                Nombre de la nueva categoría
                <input autoFocus value={catNueva} onChange={(e) => setCatNueva(e.target.value)} maxLength={40}
                  placeholder="Ej. Librería"
                  className={cn(inputCls, "mt-1")} />
              </label>
            )}

            <label className="col-span-2 flex cursor-pointer items-center gap-2 self-end rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-xs font-medium text-slate-300 sm:col-span-2">
              <input type="checkbox" checked={form.favorito} onChange={(e) => set({ favorito: e.target.checked })}
                className="accent-emerald-500" />
              Acceso rápido
            </label>

            {!ocultarCostos && (
              <div className="col-span-2 self-end text-right text-[11px] text-slate-400">
                Margen
                <p className={cn("text-sm font-semibold", margen < 20 ? "text-amber-300" : "text-emerald-400")}>
                  {margen.toFixed(0)}% · {formatARS(Number(form.venta) || 0)}{pesable ? "/kg" : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3">
            {editando && (
              borrar ? (
                <button onClick={confirmarBorrado} disabled={guardando}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50">
                  <Trash2 className="size-3.5" /> Confirmar baja
                </button>
              ) : (
                <button onClick={() => setBorrar(true)} disabled={guardando} title="Dar de baja el producto (conserva las ventas)"
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                  <Trash2 className="size-3.5" /> Dar de baja
                </button>
              )
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onClose} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50">
                <Save className="size-4" /> {guardando ? "Guardando..." : editando ? "Guardar cambios" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {emojis && (
        <EmojiPicker
          titulo={form.nombre || "Producto"}
          sugerido={sugerido}
          actual={form.emoji || null}
          onSelect={(emoji) => { set({ emoji: emoji ?? "" }); setEmojis(false); }}
          onClose={() => setEmojis(false)}
        />
      )}

      {camara && (
        <CameraScanner
          onDetect={(code) => {
            const normalizado = normalizarCodigo(code);
            set({ codigo: normalizado });
            toast.success(`Código escaneado: ${normalizado}`);
          }}
          onClose={() => setCamara(false)}
        />
      )}
    </>
  );
}
