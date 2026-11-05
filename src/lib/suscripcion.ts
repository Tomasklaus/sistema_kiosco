export type EstadoSuscripcion =
  | "prueba"
  | "activa"
  | "pausada"
  | "inactiva"
  | "pendiente"
  | "cancelada";

export function calcularEstadoSuscripcion(sub: {
  estado?: string | null;
  fecha_fin?: string | null;
} | null): { estado: EstadoSuscripcion; diasRestantes: number; operativa: boolean } {
  if (!sub) {
    return { estado: "prueba", diasRestantes: 7, operativa: true };
  }
  const estadoRaw = (sub.estado ?? "inactiva") as EstadoSuscripcion;
  const ahora = Date.now();
  const finMs = sub.fecha_fin ? new Date(sub.fecha_fin).getTime() : null;
  const diasRestantes =
    finMs !== null && Number.isFinite(finMs)
      ? Math.ceil((finMs - ahora) / 86_400_000)
      : estadoRaw === "activa"
        ? 30
        : 0;

  const noVencida = finMs === null || finMs >= ahora;
  const operativa = (estadoRaw === "activa" || estadoRaw === "prueba") && noVencida;

  return {
    estado: estadoRaw,
    diasRestantes,
    operativa,
  };
}
