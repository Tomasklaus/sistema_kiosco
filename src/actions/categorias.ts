"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  EMOJI_CATEGORIA, EMOJI_POR_CATEGORIA, normalizarEmoji, normalizarNombreCategoria,
} from "@/lib/producto-ui";
import type { ActionResult, CategoriaConUso } from "@/types";

/** Categorías con su cantidad de productos activos y el emoji por defecto. */
export async function listarCategoriasConUso(): Promise<CategoriaConUso[]> {
  const supabase = await createClient();
  const [{ data: categorias }, { data: productos }] = await Promise.all([
    supabase.from("categorias").select("id, nombre").order("nombre"),
    supabase.from("productos").select("categoria_id").eq("activo", true),
  ]);

  const conteo = new Map<string, number>();
  for (const p of productos ?? []) {
    if (p.categoria_id) conteo.set(p.categoria_id, (conteo.get(p.categoria_id) ?? 0) + 1);
  }

  return (categorias ?? []).map((c) => ({
    ...c,
    productos: conteo.get(c.id) ?? 0,
    emoji: EMOJI_POR_CATEGORIA[c.nombre] ?? EMOJI_CATEGORIA,
  }));
}

export async function crearCategoria(input: { nombre: string }): Promise<ActionResult<{ id: string; nombre: string }>> {
  const nombre = normalizarNombreCategoria(input.nombre);
  if (!nombre) return { ok: false, error: "El nombre de la categoría es obligatorio" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("categorias").insert({ nombre }).select("id, nombre").single();
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya tenés una categoría con ese nombre" : error.message,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, data };
}

/**
 * Renombra una categoría. Los productos no pierden la relación (se guarda el id,
 * no el nombre), pero su emoji por defecto cambia con el nombre nuevo.
 */
export async function actualizarCategoria(id: string, input: { nombre: string }): Promise<ActionResult> {
  const nombre = normalizarNombreCategoria(input.nombre);
  if (!nombre) return { ok: false, error: "El nombre de la categoría es obligatorio" };

  const supabase = await createClient();
  const { error } = await supabase.from("categorias").update({ nombre }).eq("id", id);
  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya tenés una categoría con ese nombre" : error.message,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Asigna un emoji propio a todos los productos de la categoría que todavía
 * no tienen uno (equivale a "personalizar el emoji de la categoría").
 */
export async function aplicarEmojiCategoria(id: string, emoji: string | null): Promise<ActionResult<number>> {
  const limpio = normalizarEmoji(emoji);
  if (!limpio) return { ok: false, error: "Elegí un emoji" };

  const supabase = await createClient();
  const { data, error } = await supabase.from("productos")
    .update({ emoji: limpio, updated_at: new Date().toISOString() })
    .eq("categoria_id", id).eq("activo", true).is("emoji", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data?.length ?? 0 };
}

/** Elimina una categoría. Sus productos quedan "sin categoría" (on delete set null). */
export async function eliminarCategoria(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("categorias").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
