import { CajaScreen } from "@/components/caja/caja-screen";
import { obtenerCaja } from "@/actions/caja";

export default async function CajaPage() {
  return <CajaScreen caja={await obtenerCaja()} />;
}
