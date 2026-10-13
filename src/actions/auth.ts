"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect("/login?error=" + encodeURIComponent(error.message));
  redirect("/pos");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const codigo = String(formData.get("codigo") ?? "").trim();
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    // Estos metadatos los lee el trigger handle_new_user: con código se une a un negocio, sin código crea uno.
    options: {
      data: {
        negocio: String(formData.get("negocio") ?? ""),
        nombre: String(formData.get("nombre") ?? ""),
        codigo_invitacion: codigo,
      },
    },
  });
  if (error) {
    const msg = codigo && /database error/i.test(error.message)
      ? "Código de invitación inválido, vencido o ya usado"
      : error.message;
    redirect("/login?error=" + encodeURIComponent(msg));
  }
  redirect("/pos");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
