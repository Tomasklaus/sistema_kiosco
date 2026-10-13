import { obtenerConfiguracion } from "@/actions/configuracion";
import { ConfiguracionScreen } from "@/components/configuracion/configuracion-screen";
import { redirect } from "next/navigation";

export default async function ConfiguracionPage() {
  const config = await obtenerConfiguracion();
  if (!config) {
    redirect("/login");
  }

  return (
    <ConfiguracionScreen
      negocio={config.negocio}
      suscripcion={config.suscripcion}
      usuario={config.usuario}
    />
  );
}
