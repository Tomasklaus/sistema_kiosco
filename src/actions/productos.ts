"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { toUI } from "@/lib/producto-ui";
import type { ActionResult, ProductoUI } from "@/types";

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
  stock: number; stock_minimo: number; categoria_id: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert({
    ...input, codigo_barras: input.codigo_barras || null,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe un producto con ese código" : error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function actualizarProducto(
  id: string, campos: { precio_venta?: number; stock?: number; codigo_barras?: string | null }
): Promise<ActionResult> {
  const supabase = await createClient();
  const payload = { ...campos };
  if ("codigo_barras" in payload) payload.codigo_barras = payload.codigo_barras?.trim() || null;
  const { error } = await supabase.from("productos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "Ya existe un producto con ese código" : error.message };
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
