import { ReportesScreen } from "@/components/reportes/reportes-screen";
import { obtenerReporte, type RangoId } from "@/actions/reportes";

const VALIDOS: RangoId[] = ["hoy", "ayer", "7d", "mes"];

export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { r } = await searchParams;
  const rango = (VALIDOS.includes(r as RangoId) ? r : "hoy") as RangoId;
  return <ReportesScreen data={await obtenerReporte(rango)} rango={rango} />;
}
