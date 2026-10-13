import { InventarioScreen } from "@/components/inventario/inventario-screen";
import { listarCategorias, listarProductos } from "@/actions/productos";
import { obtenerSesion } from "@/actions/sesion";

export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const [productos, categorias, { codigo }, sesion] = await Promise.all([
    listarProductos(), 
    listarCategorias(), 
    searchParams,
    obtenerSesion(),
  ]);

  const esCajero = sesion?.rol === "cajero";

  // Si es cajero, ocultamos precios de costo de los productos que llegan al cliente
  const productosFiltrados = esCajero
    ? productos.map((p) => ({ ...p, precio_costo: 0 }))
    : productos;

  return (
    <InventarioScreen 
      productos={productosFiltrados} 
      categorias={categorias} 
      codigoInicial={codigo}
      ocultarCostos={esCajero}
    />
  );
}
