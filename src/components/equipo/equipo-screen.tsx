"use client";

import { useState, useTransition } from "react";
import { Users, UserPlus, KeyRound, Check, X, Trash2, Power } from "lucide-react";
import { type Miembro, type Invitacion, crearInvitacion, revocarInvitacion, actualizarMiembro } from "@/actions/equipo";
import { cn } from "@/lib/utils";

export function EquipoScreen({ inicial }: { inicial: { miembros: Miembro[]; invitaciones: Invitacion[]; migrado: boolean } }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  
  if (!inicial.migrado) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <p>Las migraciones de base de datos para equipo aún no han sido aplicadas.</p>
      </div>
    );
  }

  const start = (cb: () => Promise<any>) => startTransition(async () => {
    setError("");
    const res = await cb();
    if (res && res.ok === false) setError(res.error || "Ocurrió un error.");
  });

  const handleCrear = (rol: "admin" | "cajero") => {
    start(() => crearInvitacion(rol));
  };

  const handleRevocar = (id: string) => {
    if (confirm("¿Revocar invitación?")) {
      start(() => revocarInvitacion(id));
    }
  };

  const handleToggleActivo = (m: Miembro) => {
    start(() => actualizarMiembro(m.id, m.rol, !m.activo));
  };

  const handleChangeRol = (m: Miembro, rol: "admin" | "cajero") => {
    if (m.rol === rol) return;
    start(() => actualizarMiembro(m.id, rol, m.activo));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {error && <div className="rounded-xl bg-red-500/10 p-4 text-sm text-red-400">{error}</div>}
      
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="size-5 text-emerald-400" /> Mi Equipo
        </h2>
        <div className="flex gap-2">
          <button 
            disabled={isPending}
            onClick={() => handleCrear("cajero")}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            <UserPlus className="size-4" /> Invitar Cajero
          </button>
          <button 
            disabled={isPending}
            onClick={() => handleCrear("admin")}
            className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <KeyRound className="size-4" /> Invitar Admin
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-400">Miembros Activos</h3>
          <div className="space-y-3">
            {inicial.miembros.map(m => (
              <div key={m.id} className={cn("flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4", !m.activo && "opacity-60 grayscale")}>
                <div>
                  <div className="font-semibold text-white">{m.nombre || "Usuario"}</div>
                  <div className="text-xs text-slate-400">{m.email}</div>
                </div>
                <div className="flex items-center gap-3">
                  <select 
                    value={m.rol} 
                    onChange={(e) => handleChangeRol(m, e.target.value as any)}
                    disabled={isPending}
                    className="rounded-lg bg-black/20 border border-white/10 px-2 py-1 text-sm text-white"
                  >
                    <option value="cajero">Cajero</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button 
                    onClick={() => handleToggleActivo(m)}
                    disabled={isPending}
                    className={cn("p-1.5 rounded-lg transition", m.activo ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}
                    title={m.activo ? "Desactivar usuario" : "Activar usuario"}
                  >
                    <Power className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-400">Invitaciones Pendientes</h3>
          {inicial.invitaciones.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">
              No hay invitaciones pendientes
            </div>
          )}
          <div className="space-y-3">
            {inicial.invitaciones.map(inv => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4">
                <div>
                  <div className="font-mono text-lg font-bold text-white">{inv.codigo}</div>
                  <div className="text-xs text-slate-400">Rol: {inv.rol} • Expira: {new Date(inv.expira_at).toLocaleDateString()}</div>
                </div>
                <button 
                  onClick={() => handleRevocar(inv.id)}
                  disabled={isPending}
                  className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
