"use client";

import { useState, useTransition } from "react";
import { Users, UserPlus, KeyRound, Copy, Check, Trash2, Power, Link as LinkIcon, QrCode } from "lucide-react";
import { type Miembro, type Invitacion, crearInvitacion, revocarInvitacion, actualizarMiembro } from "@/actions/equipo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function EquipoScreen({ inicial }: { inicial: { miembros: Miembro[]; invitaciones: Invitacion[]; migrado: boolean } }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  
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
    start(async () => {
      const res = await crearInvitacion(rol);
      if (res.ok && res.data) {
        toast.success(`Invitación generada con código ${res.data}`);
      }
      return res;
    });
  };

  const handleRevocar = (id: string) => {
    if (confirm("¿Revocar esta invitación? El código ya no podrá ser utilizado.")) {
      start(() => revocarInvitacion(id));
      toast.info("Invitación revocada");
    }
  };

  const handleToggleActivo = (m: Miembro) => {
    start(() => actualizarMiembro(m.id, m.rol, !m.activo));
    toast.success(m.activo ? `Acceso desactivado para ${m.nombre || "usuario"}` : `Acceso activado para ${m.nombre || "usuario"}`);
  };

  const handleChangeRol = (m: Miembro, rol: "admin" | "cajero") => {
    if (m.rol === rol) return;
    start(() => actualizarMiembro(m.id, rol, m.activo));
    toast.success(`Rol cambiado a ${rol}`);
  };

  const copiarEnlace = (codigo: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/login?codigo=${codigo}`;
    navigator.clipboard.writeText(url);
    setCopiadoId(codigo);
    toast.success("Enlace de invitación copiado al portapapeles");
    setTimeout(() => setCopiadoId(null), 2500);
  };

  const copiarCodigo = (codigo: string) => {
    navigator.clipboard.writeText(codigo);
    setCopiadoId(codigo);
    toast.success(`Código ${codigo} copiado`);
    setTimeout(() => setCopiadoId(null), 2500);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {error && <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">{error}</div>}
      
      <div className="panel p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="size-5 text-emerald-400" /> Mi Equipo de Trabajo
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Generá códigos o enlaces directos para que tus empleados abran su cuenta en este negocio. Podés pausar o reactivar su acceso en cualquier momento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button 
            disabled={isPending}
            onClick={() => handleCrear("cajero")}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            <UserPlus className="size-4" /> Invitar Cajero
          </button>
          <button 
            disabled={isPending}
            onClick={() => handleCrear("admin")}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 active:scale-95 disabled:opacity-50"
          >
            <KeyRound className="size-4 text-emerald-400" /> Invitar Admin
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* MIEMBROS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">
              Miembros del Negocio ({inicial.miembros.length})
            </h3>
            <span className="text-[11px] text-slate-500">Cajeros solo acceden a POS, Caja y Clientes</span>
          </div>

          <div className="space-y-2.5">
            {inicial.miembros.map(m => (
              <div 
                key={m.id} 
                className={cn(
                  "panel p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition",
                  !m.activo && "opacity-50 border-red-500/20"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">{m.nombre || "Usuario"}</span>
                    {!m.activo && (
                      <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/30">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono truncate">{m.email}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Registrado el {new Date(m.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <select 
                    value={m.rol} 
                    onChange={(e) => handleChangeRol(m, e.target.value as any)}
                    disabled={isPending}
                    className="rounded-xl bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
                  >
                    <option value="cajero">Cajero (Restringido)</option>
                    <option value="admin">Administrador</option>
                  </select>

                  <button 
                    onClick={() => handleToggleActivo(m)}
                    disabled={isPending}
                    className={cn(
                      "p-2 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold",
                      m.activo 
                        ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20" 
                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                    )}
                    title={m.activo ? "Pausar/Desactivar acceso" : "Reactivar acceso"}
                  >
                    <Power className="size-3.5" />
                    <span className="hidden sm:inline">{m.activo ? "Desactivar" : "Reactivar"}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INVITACIONES PENDIENTES */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">
            Invitaciones Pendientes ({inicial.invitaciones.length})
          </h3>

          {inicial.invitaciones.length === 0 && (
            <div className="panel p-8 text-center text-xs text-slate-500 border-dashed space-y-2">
              <p>No tenés invitaciones pendientes.</p>
              <p className="text-[11px] text-slate-600">Tocá "Invitar Cajero" para generar un código y compartírselo a tu empleado.</p>
            </div>
          )}

          <div className="space-y-2.5">
            {inicial.invitaciones.map(inv => (
              <div key={inv.id} className="panel p-3.5 flex flex-col gap-2.5 border-emerald-400/20">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-extrabold text-emerald-300 tracking-wider">
                    {inv.codigo}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white/5 text-slate-300 border border-white/5">
                    Rol: {inv.rol}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400">
                  Expira el: {new Date(inv.expira_at).toLocaleDateString()}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                  <button 
                    onClick={() => copiarEnlace(inv.codigo)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-1.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 transition"
                  >
                    {copiadoId === inv.codigo ? <Check className="size-3.5 text-emerald-400" /> : <LinkIcon className="size-3.5" />}
                    Copiar Enlace
                  </button>

                  <button 
                    onClick={() => copiarCodigo(inv.codigo)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 transition"
                    title="Copiar solo el código"
                  >
                    <Copy className="size-3.5" />
                  </button>

                  <button 
                    onClick={() => handleRevocar(inv.id)}
                    disabled={isPending}
                    className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Revocar invitación"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
