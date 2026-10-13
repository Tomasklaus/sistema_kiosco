import { InventarioScreen } from "@/components/inventario/inventario-screen";
import { listarCategorias, listarProductos } from "@/actions/productos";

export default async function InventarioPage() {
  const [productos, categorias] = await Promise.all([listarProductos(), listarCategorias()]);
  return <InventarioScreen productos={productos} categorias={categorias} />;
}
