import { PosScreen } from "@/components/pos/pos-screen";
import { listarCategorias, listarProductos } from "@/actions/productos";
import { obtenerCaja } from "@/actions/caja";
import { listarClientes } from "@/actions/clientes";
import { obtenerSesion } from "@/actions/sesion";
import { puedeVerCostos } from "@/lib/permisos";

export default async function PosPage() {
  const [productos, categorias, caja, clientes, sesion] = await Promise.all([
    listarProductos(), listarCategorias(), obtenerCaja(), listarClientes(), obtenerSesion(),
  ]);

  // El cajero no debe recibir los costos en el navegador
  const puedeEditar = sesion ? puedeVerCostos(sesion.rol) : false;
  const productosFiltrados = puedeEditar ? productos : productos.map((p) => ({ ...p, precio_costo: 0 }));

  return (
    <PosScreen
      productos={productosFiltrados}
      categorias={categorias}
      turnoAbierto={!!caja}
      clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
      puedeEditar={puedeEditar}
    />
  );
}
