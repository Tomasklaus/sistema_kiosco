"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  normalizarEmoji, normalizarNombreProducto, normalizarUnidadVenta, redondearDinero, redondearStock,
  toUI, validarProducto,
} from "@/lib/producto-ui";
import type { ActionResult, MetodoPagoEgreso, ProductoUI, UnidadVenta } from "@/types";

/** Campos de un producto editables en cualquier pantalla (inventario, POS, etc.). */
export type ProductoEditable = {
  nombre?: string;
  categoria_id?: string | null;
  precio_costo?: number;
  precio_venta?: number;
  stock?: number;
  stock_minimo?: number;
  codigo_barras?: string | null;
  emoji?: string | null;
  acceso_rapido?: boolean;
  /** `"unit"` = por unidad, `"kg"` = por peso (migración 0010). */
  unidad_venta?: UnidadVenta;
};

/**
 * Contexto del cambio de stock para la bitácora de caja (migración 0008).
 * `motivo`: compra_proveedor, reposicion, merma_rotura, ajuste_inventario…
 * `afecta_caja`: la operatoria también movió dinero (por defecto, sí cuando
 * el stock sube).
 */
export type ContextoStock = {
  motivo?: string;
  detalle?: string;
  afecta_caja?: boolean;
  /** Nº de comprobante / factura, para no duplicar el vínculo. */
  referencia?: string;
  /**
   * Con qué se pagó la mercadería (migración 0011): `efectivo` descuenta la
   * caja física; `mercadopago` (transferencia / MP) la deja intacta.
   */
  metodo_pago?: MetodoPagoEgreso;
};

export async function listarProductos(): Promise<ProductoUI[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos").select("*, categorias(nombre)").eq("activo", true).order("nombre");
  return (data ?? []).map(toUI);
}

export async function listarCategorias(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categorias").select("id, nombre").order("nombre");
  return data ?? [];
}

export async function crearProducto(input: {
  codigo_barras: string; nombre: string; precio_costo: number; precio_venta: number;
  stock: number; stock_minimo: number; categoria_id: string | null; emoji?: string | null;
  acceso_rapido?: boolean; unidad_venta?: UnidadVenta;
}): Promise<ActionResult> {
  const nombre = normalizarNombreProducto(input.nombre);
  const datos = {
    nombre: nombre ?? "",
    precio_costo: redondearDinero(input.precio_costo),
    precio_venta: redondearDinero(input.precio_venta),
  };
  const invalido = validarProducto(datos);
  if (invalido) return { ok: false, error: invalido };

  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert({
    ...input,
    ...datos,
    stock: redondearStock(input.stock),
    stock_minimo: redondearStock(input.stock_minimo),
    codigo_barras: input.codigo_barras.trim() || null,
    emoji: normalizarEmoji(input.emoji),
    acceso_rapido: Boolean(input.acceso_rapido),
    // Por defecto "por unidad": es el comportamiento histórico del kiosco.
    unidad_venta: normalizarUnidadVenta(input.unidad_venta),
  });
  if (error) return { ok: false, error: mensajeErrorProducto(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Traduce los errores de Postgres a algo que se entienda en la pantalla. */
function mensajeErrorProducto(error: { code?: string; message: string; details?: string | null }): string {
  if (error.code === "23505") return "Ya existe un producto con ese código";
  // Columna `unidad_venta` inexistente: falta aplicar la migración 0010.
  if (error.code === "42703" || error.code === "PGRST204") {
    return "Falta aplicar la migración 0010 (productos pesables) en la base de datos";
  }
  // Valor inválido del enum unidad_venta (por si llega algo raro desde el cliente).
  if (error.code === "22P02") return "El tipo de venta del producto no es válido";
  return error.message;
}


/** Edición parcial de un producto. Cualquier campo omitido queda intacto. */
export async function actualizarProducto(
  id: string,
  campos: ProductoEditable,
  contexto?: ContextoStock,
): Promise<ActionResult> {
  const payload: ProductoEditable = { ...campos };

  if ("nombre" in payload) {
    const nombre = normalizarNombreProducto(payload.nombre);
    if (!nombre) return { ok: false, error: "El nombre del producto es obligatorio" };
    payload.nombre = nombre;
  }
  if ("precio_costo" in payload) {
    const costo = redondearDinero(payload.precio_costo ?? 0);
    if (costo < 0) return { ok: false, error: "El costo no puede ser negativo" };
    payload.precio_costo = costo;
  }
  if ("precio_venta" in payload) {
    const venta = redondearDinero(payload.precio_venta ?? 0);
    if (venta < 0) return { ok: false, error: "El precio de venta no puede ser negativo" };
    payload.precio_venta = venta;
  }
  if ("stock" in payload) payload.stock = redondearStock(payload.stock ?? 0);
  if ("stock_minimo" in payload) {
    const minimo = redondearStock(payload.stock_minimo ?? 0);
    if (minimo < 0) return { ok: false, error: "El stock mínimo no puede ser negativo" };
    payload.stock_minimo = minimo;
  }
  if ("codigo_barras" in payload) payload.codigo_barras = payload.codigo_barras?.trim() || null;
  if ("emoji" in payload) payload.emoji = normalizarEmoji(payload.emoji);
  if ("unidad_venta" in payload) payload.unidad_venta = normalizarUnidadVenta(payload.unidad_venta);
  if ("categoria_id" in payload) payload.categoria_id = payload.categoria_id || null;

  if (!Object.keys(payload).length) return { ok: false, error: "No hay cambios para guardar" };

  const supabase = await createClient();
  // El trigger de la migración 0008 registra el cambio de stock en la bitácora
  // con este motivo (si la migración no está aplicada, el valor se ignora).
  await supabase.rpc("set_bitacora_contexto", {
    p_motivo: contexto?.motivo ?? null,
    p_detalle: contexto?.detalle ?? null,
    p_afecta_caja: contexto?.afecta_caja ?? null,
    p_referencia: contexto?.referencia ?? null,
  });

  // Migración 0011: el medio de pago del egreso. Va en una llamada aparte para
  // que, si la base todavía no tiene la migración, el cambio de stock se guarde
  // igual (el medio queda como efectivo, el comportamiento histórico).
  if (contexto?.metodo_pago) {
    await supabase.rpc("set_bitacora_metodo_pago", { p_metodo_pago: contexto.metodo_pago });
  }

  const { error } = await supabase.from("productos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: mensajeErrorProducto(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Baja lógica: conserva las ventas históricas y saca el producto de POS/catálogo. */
export async function eliminarProducto(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("productos")
    .update({ activo: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function aplicarAumentoCategoria(categoriaId: string, porcentaje: number): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aplicar_aumento_categoria", {
    p_categoria: categoriaId, p_porcentaje: porcentaje,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data as number };
}

export async function cargarDatosDemo(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cargar_datos_demo");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
