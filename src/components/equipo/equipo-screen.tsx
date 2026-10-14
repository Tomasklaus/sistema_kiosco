"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Power,
  Link as LinkIcon,
  Crown,
} from "lucide-react";
import {
  type Miembro,
  type Invitacion,
  crearInvitacion,
  revocarInvitacion,
  actualizarMiembro,
} from "@/actions/equipo";
import { cn } from "@/lib/utils";
import {
  ROL_DESCRIPCION,
  ROL_LABEL,
  puedeEditarMiembros,
  puedeInvitarAdmin,
} from "@/lib/permisos";
import type { RolUsuario } from "@/types";
import { toast } from "sonner";

type Props = {
  inicial: { miembros: Miembro[]; invitaciones: Invitacion[]; migrado: boolean };
  rolActual: RolUsuario;
  userId: string;
};

export function EquipoScreen({ inicial, rolActual, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const puedeEditar = puedeEditarMiembros(rolActual);
  const puedeAdminInvite = puedeInvitarAdmin(rolActual);

  if (!inicial.migrado) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <p>Las migraciones de base de datos para equipo aún no han sido aplicadas.</p>
        <p className="mt-2 text-xs text-slate-500">
          Ejecutá las migraciones 0004 y 0006 en Supabase y recargá esta página.
        </p>
      </div>
    );
  }

  const run = (cb: () => Promise<{ ok: boolean; error?: string; data?: string } | void>) => {
    startTransition(async () => {
      setError("");
      const res = await cb();
      if (res && res.ok === false) {
        setError(res.error || "Ocurrió un error.");
        toast.error(res.error || "Ocurrió un error.");
        return;
      }
      router.refresh();
    });
  };

  const handleCrear = (rol: "admin" | "cajero") => {
    run(async () => {
      const res = await crearInvitacion(rol);
      if (res.ok && res.data) {
        toast.success(`Invitación generada: ${res.data}`);
      }
      return res;
    });
  };

  const handleRevocar = (id: string) => {
    if (!confirm("¿Revocar esta invitación? El código ya no podrá ser utilizado.")) return;
    run(async () => {
      const res = await revocarInvitacion(id);
      if (res.ok) toast.info("Invitación revocada");
      return res;
    });
  };

  const handleToggleActivo = (m: Miembro) => {
    if (m.rol === "owner") return;
    const nuevoActivo = !m.activo;
    run(async () => {
      const res = await actualizarMiembro(m.id, m.rol === "admin" ? "admin" : "cajero", nuevoActivo);
      if (res.ok) {
        toast.success(
          nuevoActivo
            ? `Acceso activado para ${m.nombre || "usuario"}`
            : `Acceso desactivado para ${m.nombre || "usuario"}`
        );
      }
      return res;
    });
  };

  const handleChangeRol = (m: Miembro, rol: "admin" | "cajero") => {
    if (m.rol === rol || m.rol === "owner") return;
    run(async () => {
      const res = await actualizarMiembro(m.id, rol, m.activo);
      if (res.ok) toast.success(`Rol cambiado a ${ROL_LABEL[rol]}`);
      return res;
    });
  };

  const copiarEnlace = (codigo: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/login?codigo=${codigo}`;
    navigator.clipboard.writeText(url);
    setCopiadoId(codigo);
    toast.success("Enlace de invitación copiado");
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
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="panel flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-white">
            <Users className="size-5 text-emerald-400" /> Mi Equipo de Trabajo
          </h2>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Invitá empleados a tu mismo negocio con un código o enlace. Cada rango limita a qué
            módulos pueden entrar.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            disabled={isPending}
            onClick={() => handleCrear("cajero")}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:brightness-110 active:scale-95 disabled:opacity-50 sm:flex-initial"
          >
            <UserPlus className="size-4" /> Invitar Cajero
          </button>
          {puedeAdminInvite && (
            <button
              disabled={isPending}
              onClick={() => handleCrear("admin")}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 active:scale-95 disabled:opacity-50 sm:flex-initial"
            >
              <KeyRound className="size-4 text-emerald-400" /> Invitar Admin
            </button>
          )}
        </div>
      </div>

      {/* Matriz de rangos */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(["owner", "admin", "cajero"] as RolUsuario[]).map((rol) => (
          <div key={rol} className="panel space-y-1 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">
              {ROL_LABEL[rol]}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">{ROL_DESCRIPCION[rol]}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-300">
              Miembros del Negocio ({inicial.miembros.length})
            </h3>
            <span className="text-[11px] text-slate-500">
              Cajero: ventas, inventario, caja y clientes
            </span>
          </div>

          <div className="space-y-2.5">
            {inicial.miembros.map((m) => {
              const esOwner = m.rol === "owner";
              const esYo = m.id === userId;
              const editable = puedeEditar && !esOwner && !esYo;

              return (
                <div
                  key={m.id}
                  className={cn(
                    "panel flex flex-col justify-between gap-3 p-3.5 transition sm:flex-row sm:items-center sm:p-4",
                    !m.activo && "border-red-500/20 opacity-50"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-white">
                        {m.nombre || "Usuario"}
                      </span>
                      {esOwner && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                          <Crown className="size-3" /> Dueño
                        </span>
                      )}
                      {esYo && (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                          Vos
                        </span>
                      )}
                      {!m.activo && (
                        <span className="rounded border border-red-500/30 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono text-xs text-slate-400">{m.email}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {ROL_LABEL[m.rol]} · desde{" "}
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  {editable ? (
                    <div className="flex items-center gap-2.5 self-end sm:self-center">
                      <select
                        value={m.rol}
                        onChange={(e) =>
                          handleChangeRol(m, e.target.value as "admin" | "cajero")
                        }
                        disabled={isPending}
                        className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400"
                      >
                        <option value="cajero">Cajero</option>
                        <option value="admin">Administrador</option>
                      </select>

                      <button
                        onClick={() => handleToggleActivo(m)}
                        disabled={isPending}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl border p-2 text-xs font-semibold transition",
                          m.activo
                            ? "border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                        )}
                        title={m.activo ? "Desactivar acceso" : "Reactivar acceso"}
                      >
                        <Power className="size-3.5" />
                        <span className="hidden sm:inline">
                          {m.activo ? "Desactivar" : "Reactivar"}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="self-end sm:self-center">
                      <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                        {ROL_LABEL[m.rol]}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!puedeEditar && (
            <p className="text-[11px] text-slate-500">
              Solo el dueño puede cambiar roles o desactivar miembros. Como admin podés invitar
              cajeros y revocar códigos pendientes.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">
            Invitaciones Pendientes ({inicial.invitaciones.length})
          </h3>

          {inicial.invitaciones.length === 0 && (
            <div className="panel space-y-2 border-dashed p-8 text-center text-xs text-slate-500">
              <p>No tenés invitaciones pendientes.</p>
              <p className="text-[11px] text-slate-600">
                Tocá &quot;Invitar Cajero&quot;, copiá el enlace y compartíselo a tu empleado.
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {inicial.invitaciones.map((inv) => (
              <div key={inv.id} className="panel flex flex-col gap-2.5 border-emerald-400/20 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-extrabold tracking-wider text-emerald-300">
                    {inv.codigo}
                  </span>
                  <span className="rounded border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
                    {ROL_LABEL[inv.rol]}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400">
                  Expira el: {new Date(inv.expira_at).toLocaleDateString()} ·{" "}
                  {ROL_DESCRIPCION[inv.rol]}
                </div>

                <div className="flex items-center gap-2 border-t border-white/5 pt-1">
                  <button
                    onClick={() => copiarEnlace(inv.codigo)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
                  >
                    {copiadoId === inv.codigo ? (
                      <Check className="size-3.5 text-emerald-400" />
                    ) : (
                      <LinkIcon className="size-3.5" />
                    )}
                    Copiar Enlace
                  </button>

                  <button
                    onClick={() => copiarCodigo(inv.codigo)}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10"
                    title="Copiar solo el código"
                  >
                    <Copy className="size-3.5" />
                  </button>

                  <button
                    onClick={() => handleRevocar(inv.id)}
                    disabled={isPending}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
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
