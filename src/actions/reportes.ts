"use server";

import { createClient } from "@/lib/supabase/server";
import type { MetodoPago, ReporteData } from "@/types";

export type RangoId = "hoy" | "ayer" | "7d" | "mes";

const AR_OFFSET_MS = 3 * 3600_000; // Argentina = UTC-3 (sin horario de verano)
const HORA_AR = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

function limites(rango: RangoId): { desde: Date; hasta: Date } {
  const ahoraAR = new Date(Date.now() - AR_OFFSET_MS);
  const inicioHoyUTC = Date.UTC(ahoraAR.getUTCFullYear(), ahoraAR.getUTCMonth(), ahoraAR.getUTCDate()) + AR_OFFSET_MS;
  const dia = 86400_000;
  switch (rango) {
    case "hoy": return { desde: new Date(inicioHoyUTC), hasta: new Date(inicioHoyUTC + dia) };
    case "ayer": return { desde: new Date(inicioHoyUTC - dia), hasta: new Date(inicioHoyUTC) };
    case "7d": return { desde: new Date(inicioHoyUTC - 6 * dia), hasta: new Date(inicioHoyUTC + dia) };
    case "mes": {
      const ini = Date.UTC(ahoraAR.getUTCFullYear(), ahoraAR.getUTCMonth(), 1) + AR_OFFSET_MS;
      return { desde: new Date(ini), hasta: new Date(inicioHoyUTC + dia) };
    }
  }
}

export async function obtenerReporte(rango: RangoId): Promise<ReporteData> {
  const supabase = await createClient();
  const { desde, hasta } = limites(rango);

  const { data: ventas } = await supabase
    .from("ventas").select("total, metodo_pago, created_at")
    .eq("estado", "completada").gte("created_at", desde.toISOString()).lt("created_at", hasta.toISOString());

  const { data: items } = await supabase
    .from("venta_items")
    .select("nombre_producto, cantidad, subtotal, precio_costo, ventas!inner(created_at, estado)")
    .eq("ventas.estado", "completada")
    .gte("ventas.created_at", desde.toISOString()).lt("ventas.created_at", hasta.toISOString());

  const horas = Array<number>(24).fill(0);
  const pagos: Record<MetodoPago, number> = { efectivo: 0, mercadopago: 0, tarjeta: 0, cuenta_corriente: 0 };
  let total = 0;
  for (const v of ventas ?? []) {
    const h = Number(HORA_AR.format(new Date(v.created_at))) % 24;
    horas[h] += Number(v.total);
    pagos[v.metodo_pago as MetodoPago] += Number(v.total);
    total += Number(v.total);
  }

  const unidades = new Map<string, number>();
  const ganancia = new Map<string, number>();
  for (const it of items ?? []) {
    unidades.set(it.nombre_producto, (unidades.get(it.nombre_producto) ?? 0) + Number(it.cantidad));
    ganancia.set(it.nombre_producto, (ganancia.get(it.nombre_producto) ?? 0) + Number(it.subtotal) - Number(it.precio_costo) * Number(it.cantidad));
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return { total, horas, pagos, topUnidades: top(unidades), topRentabilidad: top(ganancia) };
}
