import { CajaScreen } from "@/components/caja/caja-screen";
import { obtenerCaja, obtenerBitacora } from "@/actions/caja";
import { obtenerSesion } from "@/actions/sesion";
import { puedeVerBitacora } from "@/lib/permisos";

export default async function CajaPage() {
  const [caja, sesion] = await Promise.all([obtenerCaja(), obtenerSesion()]);
  const verBitacora = Boolean(sesion?.rol && puedeVerBitacora(sesion.rol));
  return (
    <CajaScreen
      caja={caja}
      rol={sesion?.rol ?? "cajero"}
      bitacoraInicial={verBitacora ? await obtenerBitacora("hoy") : null}
    />
  );
}
