import type { RolUsuario } from "@/types";

/** Módulos del negocio y qué rangos pueden verlos / usarlos. */
export const MODULOS_POR_ROL: Record<string, RolUsuario[]> = {
  "/pos": ["owner", "admin", "cajero"],
  "/inventario": ["owner", "admin", "cajero"],
  "/caja": ["owner", "admin", "cajero"],
  "/clientes": ["owner", "admin", "cajero"],
  "/reportes": ["owner", "admin"],
  "/equipo": ["owner", "admin"],
  "/configuracion": ["owner", "admin"],
  "/suscripcion": ["owner"],
};

export const ROL_LABEL: Record<RolUsuario, string> = {
  owner: "Dueño",
  admin: "Administrador",
  cajero: "Cajero",
};

export const ROL_DESCRIPCION: Record<RolUsuario, string> = {
  owner: "Control total del negocio, equipo y facturación",
  admin: "Operación completa + reportes y configuración (sin cambiar dueño)",
  cajero: "Ventas, inventario, caja y clientes",
};

export function puedeAcceder(rol: RolUsuario, href: string): boolean {
  const roles = MODULOS_POR_ROL[href];
  if (!roles) return true;
  return roles.includes(rol);
}

export function esGestionEquipo(rol: RolUsuario): boolean {
  return rol === "owner" || rol === "admin";
}

export function puedeInvitarAdmin(rol: RolUsuario): boolean {
  return rol === "owner";
}

export function puedeEditarMiembros(rol: RolUsuario): boolean {
  return rol === "owner";
}
