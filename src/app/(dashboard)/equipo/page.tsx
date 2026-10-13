import { EquipoScreen } from "@/components/equipo/equipo-screen";
import { listarEquipo } from "@/actions/equipo";
import { obtenerSesion } from "@/actions/sesion";
import { redirect } from "next/navigation";

export default async function EquipoPage() {
  const sesion = await obtenerSesion();
  // Solo dueños o administradores pueden gestionar miembros e invitaciones
  if (sesion?.rol === "cajero") {
    redirect("/pos");
  }

  const data = await listarEquipo();
  return <EquipoScreen inicial={data} />;
}
