import { AccesoBloqueado } from "@/components/acceso-bloqueado";
import { AppShell } from "@/components/app-shell";
import { esPlatformAdmin } from "@/actions/admin";
import { obtenerSesion } from "@/actions/sesion";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [esAdmin, sesion] = await Promise.all([
    esPlatformAdmin(),
    obtenerSesion(),
  ]);

  if (!sesion) {
    redirect("/login");
  }

  if (!sesion.activo) {
    return <AccesoBloqueado nombre={sesion.nombre ?? sesion.email} />;
  }

  return (
    <AppShell
      esAdmin={esAdmin}
      rolUsuario={sesion.rol}
      nombreUsuario={sesion.nombre ?? sesion.email}
      nombreNegocio={sesion.negocio}
    >
      {children}
    </AppShell>
  );
}
