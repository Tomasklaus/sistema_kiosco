import { InventarioScreen } from "@/components/inventario/inventario-screen";
import { listarCategorias, listarProductos } from "@/actions/productos";

export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const [productos, categorias, { codigo }] = await Promise.all([listarProductos(), listarCategorias(), searchParams]);
  return <InventarioScreen productos={productos} categorias={categorias} codigoInicial={codigo} />;
}
