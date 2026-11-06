import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con permisos de servicio (Service Role).
 * Sólo debe ejecutarse en el servidor para tareas administrativas de la plataforma.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase (URL o Service Role Key)");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

