import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = {
  title: "Iniciar Sesión | Kiosco POS",
  description: "Ingresá a tu cuenta de Kiosco POS para gestionar ventas, inventario y caja.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; codigo?: string; tab?: string; mode?: string }>;
}) {
  const { error, codigo, tab, mode } = await searchParams;
  const isRegister =
    Boolean(codigo?.trim()) ||
    tab === "register" ||
    tab === "signup" ||
    mode === "register" ||
    mode === "signup";

  return (
    <AuthScreen
      initialTab={isRegister ? "register" : "login"}
      initialError={error}
      initialCodigo={codigo}
    />
  );
}
