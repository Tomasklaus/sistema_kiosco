import { ClientesScreen } from "@/components/clientes/clientes-screen";
import { listarClientes } from "@/actions/clientes";

export default async function ClientesPage() {
  return <ClientesScreen clientes={await listarClientes()} />;
}
