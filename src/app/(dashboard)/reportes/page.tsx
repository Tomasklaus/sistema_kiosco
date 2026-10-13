import { ReportesScreen } from "@/components/reportes/reportes-screen";
import { obtenerReporte, type RangoId } from "@/actions/reportes";
import { obtenerSesion } from "@/actions/sesion";
import { redirect } from "next/navigation";

const VALIDOS: RangoId[] = ["hoy", "ayer", "7d", "mes"];

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const sesion = await obtenerSesion();
  // Limitar visualización: los cajeros no pueden ver métricas financieras globales
  if (sesion?.rol === "cajero") {
    redirect("/pos");
  }

  const { r } = await searchParams;
  const rango = (VALIDOS.includes(r as RangoId) ? r : "hoy") as RangoId;
  return <ReportesScreen data={await obtenerReporte(rango)} rango={rango} />;
}
