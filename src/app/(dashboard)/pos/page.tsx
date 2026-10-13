import { PosScreen } from "@/components/pos/pos-screen";
import { listarProductos } from "@/actions/productos";
import { obtenerCaja } from "@/actions/caja";
import { listarClientes } from "@/actions/clientes";

export default async function PosPage() {
  const [productos, caja, clientes] = await Promise.all([listarProductos(), obtenerCaja(), listarClientes()]);
  return (
    <PosScreen
      productos={productos}
      turnoAbierto={!!caja}
      clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
    />
  );
}
