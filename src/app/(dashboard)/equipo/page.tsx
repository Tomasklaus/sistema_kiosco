import { EquipoScreen } from "@/components/equipo/equipo-screen";
import { listarEquipo } from "@/actions/equipo";
import { obtenerSesion } from "@/actions/sesion";
import { esGestionEquipo } from "@/lib/permisos";
import { redirect } from "next/navigation";

export default async function EquipoPage() {
  const sesion = await obtenerSesion();
  if (!sesion?.activo || !esGestionEquipo(sesion.rol)) {
    redirect("/pos");
  }

  const data = await listarEquipo();
  return (
    <EquipoScreen
      inicial={data}
      rolActual={sesion.rol}
      userId={sesion.id}
    />
  );
}
