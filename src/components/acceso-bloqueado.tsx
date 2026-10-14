import { logout } from "@/actions/auth";
import { LogOut, ShieldOff } from "lucide-react";

export function AccesoBloqueado({ nombre }: { nombre?: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1020] p-6">
      <div className="panel max-w-md space-y-4 p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
          <ShieldOff className="size-6" />
        </div>
        <h1 className="text-xl font-bold text-white">Acceso desactivado</h1>
        <p className="text-sm text-slate-400">
          {nombre ? `Hola ${nombre}. ` : ""}
          Tu cuenta fue pausada por el dueño del negocio. Pedile que reactive tu acceso o cerrá
          sesión.
        </p>
        <form action={logout}>
          <button className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15">
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
