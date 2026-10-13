import { redirect } from "next/navigation";
import { AdminScreen } from "@/components/admin/admin-screen";
import { obtenerPanelAdmin } from "@/actions/admin";

export default async function AdminPage() {
  const data = await obtenerPanelAdmin();
  if (!data) redirect("/pos"); // no es admin de plataforma (o falta la migración 0003)
  return <AdminScreen {...data} />;
}
