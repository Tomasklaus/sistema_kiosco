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

/**
 * Edición completa de productos (nombre, costo, categoría, baja, etc.).
 * El cajero ve el botón de edición en el POS pero con los campos de costo ocultos.
 */
export function puedeEditarProductos(rol: RolUsuario): boolean {
  // Hoy todos los roles con acceso a inventario pueden editar; el cajero no ve costos.
  return Boolean(rol);
}

/** Ver y editar costos/márgenes: sólo dueño y administrador. */
export function puedeVerCostos(rol: RolUsuario): boolean {
  return rol === "owner" || rol === "admin";
}
