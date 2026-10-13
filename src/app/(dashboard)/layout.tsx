import { AppShell } from "@/components/app-shell";
import { esPlatformAdmin } from "@/actions/admin";
import { obtenerSesion } from "@/actions/sesion";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [esAdmin, sesion] = await Promise.all([
    esPlatformAdmin(),
    obtenerSesion(),
  ]);

  return (
    <AppShell 
      esAdmin={esAdmin} 
      rolUsuario={sesion?.rol ?? "owner"}
      nombreUsuario={sesion?.nombre ?? sesion?.email ?? "Usuario"}
      nombreNegocio={sesion?.negocio ?? "Mi Kiosco"}
    >
      {children}
    </AppShell>
  );
}
