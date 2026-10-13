import { EquipoScreen } from "@/components/equipo/equipo-screen";
import { listarEquipo } from "@/actions/equipo";

export default async function EquipoPage() {
  const data = await listarEquipo();
  return <EquipoScreen inicial={data} />;
}
