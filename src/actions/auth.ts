"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { traducirErrorAuth } from "@/lib/auth-errors";

export type AuthActionResult = {
  ok: boolean;
  error?: string;
  requiresEmailConfirmation?: boolean;
  message?: string;
};

export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  try {
    const supabase = await createClient();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return { ok: false, error: "Por favor completá el email y la contraseña." };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, error: traducirErrorAuth(error.message) };
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al iniciar sesión";
    return { ok: false, error: traducirErrorAuth(msg) };
  }
}

export async function signupAction(formData: FormData): Promise<AuthActionResult> {
  try {
    const supabase = await createClient();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const nombre = String(formData.get("nombre") ?? "").trim();
    const negocio = String(formData.get("negocio") ?? "").trim();
    const codigo = String(formData.get("codigo") ?? "").trim().toUpperCase();
    const tipoRegistro = String(formData.get("tipo_registro") ?? "owner");

    if (!email || !password) {
      return { ok: false, error: "Email y contraseña son obligatorios." };
    }

    if (password.length < 6) {
      return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
    }

    if (tipoRegistro === "invite" && !codigo) {
      return { ok: false, error: "Por favor ingresá el código de invitación." };
    }

    if (tipoRegistro === "owner" && !negocio) {
      return { ok: false, error: "Por favor ingresá el nombre de tu kiosco o negocio." };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          negocio: tipoRegistro === "invite" ? "" : (negocio || "Mi Negocio"),
          nombre: nombre || "Usuario",
          codigo_invitacion: tipoRegistro === "invite" ? codigo : "",
        },
      },
    });

    if (error) {
      const msg =
        (codigo || tipoRegistro === "invite") && /database error/i.test(error.message)
          ? "Código de invitación inválido, vencido o ya usado"
          : error.message;
      return { ok: false, error: traducirErrorAuth(msg) };
    }

    // Si Supabase tiene confirmación de email obligatoria, no habrá sesión activa de inmediato
    if (data?.user && !data?.session && (data.user.identities?.length ?? 0) > 0) {
      return {
        ok: true,
        requiresEmailConfirmation: true,
        message: "¡Cuenta creada! Te enviamos un correo de confirmación. Verificalo para poder ingresar.",
      };
    }

    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al registrarse";
    return { ok: false, error: traducirErrorAuth(msg) };
  }
}

export async function login(formData: FormData) {
  const res = await loginAction(formData);
  if (!res.ok) {
    redirect("/login?error=" + encodeURIComponent(res.error || "Error al iniciar sesión"));
  }
  redirect("/pos");
}

export async function signup(formData: FormData) {
  const res = await signupAction(formData);
  if (!res.ok) {
    redirect("/register?error=" + encodeURIComponent(res.error || "Error al registrarse"));
  }
  redirect("/pos");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
