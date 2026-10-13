import { AppShell } from "@/components/app-shell";
import { esPlatformAdmin } from "@/actions/admin";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell esAdmin={await esPlatformAdmin()}>{children}</AppShell>;
}
