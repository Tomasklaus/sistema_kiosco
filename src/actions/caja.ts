"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenerSesion } from "@/actions/sesion";
import { puedeVerBitacora } from "@/lib/permisos";
import type {
  ActionResult, BitacoraData, CajaData, IngresoStockRow, MovimientoBitacora,
  RangoBitacora, TurnoBitacora,
} from "@/types";

const CAMPOS_MOV = "id, tipo, metodo_pago, monto, descripcion, created_at";

export async function obtenerCaja(): Promise<CajaData | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // Cada persona del negocio tiene su propio turno: solo se ve el que abrió el usuario actual.
  const { data: turno } = await supabase
    .from("turnos_caja").select("*").eq("estado", "abierto").eq("usuario_apertura", user.id).maybeSingle();
  if (!turno) return null;
  const { data: movimientos } = await supabase
    .from("movimientos_caja").select(CAMPOS_MOV)
    .eq("turno_id", turno.id).order("created_at", { ascending: true });
  return { turno, movimientos: (movimientos ?? []) as CajaData["movimientos"] };
}

export async function abrirTurno(montoInicial: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("abrir_turno", { p_monto_inicial: montoInicial });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Contexto opcional de un egreso para la bitácora. */
export type ContextoEgreso = {
  /** Aclaración (proveedor, comprobante…). Se agrega al concepto. */
  detalle?: string;
  /** ¿El egreso vino con ingreso de stock (reposición)? */
  stock_involucrado?: boolean;
  /** Referencia externa (nº de comprobante) para no duplicar. */
  referencia?: string | null;
  forma_pago?: string;
};

export async function registrarEgreso(
  monto: number, concepto: string, contexto: ContextoEgreso = {},
): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_egreso", {
    p_monto: monto,
    p_concepto: concepto,
    p_detalle: contexto.detalle?.trim() || null,
    p_stock_involucrado: Boolean(contexto.stock_involucrado),
    p_referencia: contexto.referencia?.trim() || null,
    p_forma_pago: contexto.forma_pago || "efectivo",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data: data as string };
}

export async function cerrarTurno(efectivoContado: number): Promise<ActionResult<{ esperado: number; contado: number; diferencia: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cerrar_turno", { p_efectivo_contado: efectivoContado });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, data };
}

/**
 * Registra un egreso que además trae mercadería ("pago al proveedor con
 * reposición"). Es el único punto donde el egreso nace ya vinculado al
 * ingreso de stock; las cantidades por producto se cargan desde Inventario.
 */
export async function registrarEgresoConStock(input: {
  monto: number;
  concepto: string;
  detalle: string;
  motivo: string;
  referencia?: string | null;
  forma_pago?: string;
}): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_egreso_stock", {
    p_monto: input.monto,
    p_concepto: input.concepto,
    p_detalle: input.detalle.trim() || null,
    p_motivo: input.motivo || "compra_proveedor",
    p_referencia: input.referencia?.trim() || null,
    p_forma_pago: input.forma_pago || "efectivo",
  });
  if (!error) {
    revalidatePath("/", "layout");
    return { ok: true, data: data as string };
  }

  // Si todavía no se aplicó la migración 0008, no bloqueamos el registro del
  // gasto: queda como egreso común (sin el vínculo fino al ingreso de stock).
  if (/function .*registrar_egreso_stock.* does not exist/i.test(error.message)) {
    return registrarEgreso(input.monto, input.concepto, {
      detalle: [input.detalle, "Ingreso de stock"].filter(Boolean).join(" — "),
      stock_involucrado: true,
      referencia: input.referencia ?? null,
      forma_pago: input.forma_pago,
    });
  }
  return { ok: false, error: error.message };
}

// =========================================================
// Bitácora (dueño y administrador)
// =========================================================
const AR_OFFSET_MS = 3 * 3600_000; // Argentina = UTC-3

function inicioDelDia(ms: number): number {
  const ar = new Date(ms - AR_OFFSET_MS);
  return Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) + AR_OFFSET_MS;
}

function rangoFechas(rango: RangoBitacora): { desde: Date; hasta: Date; anterior: Date | null } {
  const dia = 86400_000;
  const inicioHoy = inicioDelDia(Date.now());
  switch (rango) {
    case "hoy":
      return { desde: new Date(inicioHoy), hasta: new Date(inicioHoy + dia), anterior: new Date(inicioHoy - dia) };
    case "ayer":
      return { desde: new Date(inicioHoy - dia), hasta: new Date(inicioHoy), anterior: new Date(inicioHoy - 2 * dia) };
    case "7d":
      return { desde: new Date(inicioHoy - 6 * dia), hasta: new Date(inicioHoy + dia), anterior: new Date(inicioHoy - 13 * dia) };
    case "mes": {
      const ar = new Date(Date.now() - AR_OFFSET_MS);
      const inicioMes = Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1) + AR_OFFSET_MS;
      const arPrev = new Date(inicioMes - dia - AR_OFFSET_MS);
      return {
        desde: new Date(inicioMes),
        hasta: new Date(inicioHoy + dia),
        anterior: new Date(Date.UTC(arPrev.getUTCFullYear(), arPrev.getUTCMonth(), 1) + AR_OFFSET_MS),
      };
    }
    case "todo":
      return { desde: new Date(0), hasta: new Date(Date.now() + dia), anterior: null };
  }
}

type MovRaw = Omit<MovimientoBitacora, "usuario" | "items"> & { items: unknown };

function normalizarMov(m: MovRaw, nombreDe: (id: string) => string): MovimientoBitacora {
  return {
    ...m,
    items: Array.isArray(m.items) ? (m.items as MovimientoBitacora["items"]) : null,
    usuario: nombreDe(m.usuario_id),
  };
}

/**
 * Bitácora de movimientos de caja de todo el negocio.
 * Sólo dueño y administrador: el cajero ve únicamente su turno en `/caja`.
 */
export async function obtenerBitacora(
  rango: RangoBitacora = "hoy",
  operadorId?: string | null,
): Promise<BitacoraData | null> {
  const sesion = await obtenerSesion();
  if (!sesion?.activo || !puedeVerBitacora(sesion.rol)) return null;

  const supabase = await createClient();
  const { desde, hasta } = rangoFechas(rango);
  // Sin embebido de `perfiles`: el nombre del operador se resuelve aparte. Depender
  // del nombre exacto de la FK o de la columna `email` hacía fallar toda la lectura
  // y la bitácora se mostraba como "migración pendiente".
  const seleccion = "id, turno_id, created_at, tipo, metodo_pago, monto, descripcion, detalle, forma_pago, referencia, stock_involucrado, items, usuario_id, venta_id";

  let consulta = supabase
    .from("movimientos_caja")
    .select(seleccion)
    .gte("created_at", desde.toISOString())
    .lt("created_at", hasta.toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);

  if (operadorId) consulta = consulta.eq("usuario_id", operadorId);

  const [movs, turnos, equipo] = await Promise.all([
    consulta,
    supabase
      .from("turnos_caja")
      .select("id, abierto_at, cerrado_at, estado, monto_inicial, diferencia, usuario_apertura")
      .gte("abierto_at", desde.toISOString())
      .lt("abierto_at", hasta.toISOString())
      .order("abierto_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, nombre, rol").order("nombre"),
  ]);

  const migrado = !movs.error;
  const nombres = new Map(
    ((equipo.data ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre || "Usuario"]),
  );
  const nombreDe = (id: string) => nombres.get(id) ?? "Usuario";
  const filas = migrado ? (movs.data as unknown as MovRaw[]).map((m) => normalizarMov(m, nombreDe)) : [];
  // Ingresos de stock de los turnos con egresos, para ofrecer el vínculo
  // "este egreso vino con mercadería" (no escribe nada hasta confirmarlo).
  const turnosDeEgresos = [...new Set(filas.filter((m) => m.tipo.startsWith("egreso")).map((m) => m.turno_id))].slice(0, 20);
  const ingresos: IngresoStockRow[] = [];
  if (migrado && turnosDeEgresos.length) {
    const resultados = await Promise.all(
      turnosDeEgresos.map((p_turno) => supabase.rpc("ingresos_stock_del_turno", { p_turno })),
    );
    for (const r of resultados) {
      if (Array.isArray(r.data)) ingresos.push(...(r.data as unknown as IngresoStockRow[]));
    }
  }

  const esCaja = (t: string) => t.startsWith("ingreso") || t.startsWith("egreso");
  const totales = filas.reduce(
    (acc, m) => {
      if (m.tipo.startsWith("ingreso")) acc.ingresos += Number(m.monto);
      if (m.tipo.startsWith("egreso")) {
        acc.egresos += Number(m.monto);
        if (m.stock_involucrado) acc.egresosConStock += Number(m.monto);
      }
      if (esCaja(m.tipo)) acc.cantidadMovimientos += 1;
      return acc;
    },
    { ingresos: 0, egresos: 0, egresosConStock: 0, cantidadMovimientos: 0 },
  );

  const turnosRaw = (turnos.data ?? []) as unknown as {
    id: string; abierto_at: string; cerrado_at: string | null; estado: TurnoBitacora["estado"];
    monto_inicial: number; diferencia: number | null; usuario_apertura: string;
  }[];

  return {
    rango,
    desde: desde.toISOString(),
    migrado,
    error: movs.error?.message ?? null,
    movimientos: filas,
    ingresos,
    turnos: turnosRaw.map((t) => ({
      id: t.id,
      abierto_at: t.abierto_at,
      cerrado_at: t.cerrado_at,
      estado: t.estado,
      monto_inicial: Number(t.monto_inicial),
      diferencia: t.diferencia === null ? null : Number(t.diferencia),
      usuario: nombreDe(t.usuario_apertura),
    })),
    operadores: ((equipo.data ?? []) as { id: string; nombre: string | null }[])
      .map((p) => ({ id: p.id, nombre: p.nombre || "Usuario" })),
    totales,
  };
}

/** Anula una venta ya cobrada: devuelve stock y registra ambos movimientos. */
export async function anularVenta(ventaId: string, motivo: string): Promise<ActionResult> {
  const sesion = await obtenerSesion();
  if (!sesion?.activo) return { ok: false, error: "No autorizado" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_venta", { p_venta: ventaId, p_motivo: motivo.trim() || null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}


