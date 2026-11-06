import { AuthScreen } from "@/components/auth/auth-screen";

export const metadata = {
  title: "Registrarse | Kiosco POS",
  description: "Creá tu cuenta de comercio o unite a un equipo con un código de invitación.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; codigo?: string; tab?: string; mode?: string }>;
}) {
  const { error, codigo, tab, mode } = await searchParams;
  const isLogin = tab === "login" || mode === "login";

  return (
    <AuthScreen
      initialTab={isLogin ? "login" : "register"}
      initialError={error}
      initialCodigo={codigo}
    />
  );
}

