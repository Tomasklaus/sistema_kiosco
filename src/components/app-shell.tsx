"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { 
  Bell, 
  Boxes, 
  FileText, 
  Landmark, 
  ShieldCheck, 
  ShoppingCart, 
  Users, 
  UserCircle, 
  LogOut, 
  Store, 
  Settings,
  Menu,
  X
} from "lucide-react";
import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";

const links = [
  { href: "/pos", label: "Ventas (POS)", icon: ShoppingCart },
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/caja", label: "Caja", icon: Landmark },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/reportes", label: "Reportes", icon: FileText },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

const titles: Record<string, string> = {
  "/pos": "Punto de Venta",
  "/inventario": "Inventario",
  "/caja": "Caja",
  "/clientes": "Clientes",
  "/reportes": "Reportes",
  "/configuracion": "Configuración del Sistema",
  "/admin": "Panel Admin",
  "/equipo": "Mi Equipo",
};

export function AppShell({ children, esAdmin = false }: { children: React.ReactNode; esAdmin?: boolean }) {
  const path = usePathname();
  const todos = esAdmin ? [...links, { href: "/admin", label: "Panel Admin", icon: ShieldCheck }] : links;
  
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  
  const cerrarModales = () => {
    if (menuOpen) setMenuOpen(false);
    if (notifOpen) setNotifOpen(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0b1020]" onClick={cerrarModales}>
      {/* Backdrop para mobile drawer */}
      {mobileNavOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar: en desktop es fija (w-60), en mobile es un drawer deslizable */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/5 bg-[#0e1426] p-4 transition-transform duration-300 ease-in-out md:static md:w-56 md:translate-x-0 md:shrink-0",
          mobileNavOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2 text-emerald-400">
          <div className="flex items-center gap-2">
            <Store className="size-7" />
            <span className="text-lg font-bold text-white">Kiosco POS</span>
          </div>
          {/* Botón cerrar en mobile */}
          <button 
            onClick={() => setMobileNavOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white md:hidden"
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto">
          {todos.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white",
                path.startsWith(href) && "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-inner"
              )}
            >
              <Icon className="size-4 shrink-0" /> {label}
            </Link>
          ))}
        </nav>

        <form action={logout} className="pt-2 border-t border-white/5">
          <button className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-400">
            <LogOut className="size-4 shrink-0" /> Salir
          </button>
        </form>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-4 md:px-6">
          <div className="flex items-center gap-3">
            {/* Botón hamburguesa para mobile */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMobileNavOpen(true);
              }}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:text-white md:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>
            <h1 className="text-lg md:text-xl font-bold text-white truncate max-w-[200px] sm:max-w-none">
              {titles[path] ?? "Kiosco POS"}
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-3 text-slate-400" onClick={e => e.stopPropagation()}>
            {/* Notificaciones */}
            <div className="relative">
              <button 
                className="relative rounded-xl p-2 hover:bg-white/5 focus:outline-none" 
                aria-label="Notificaciones"
                onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}
              >
                <Bell className="size-5" />
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/10 bg-[#161f36] p-4 shadow-2xl z-50">
                  <h3 className="mb-2 text-sm font-semibold text-white">Notificaciones</h3>
                  <div className="text-xs text-slate-400">No tienes notificaciones nuevas.</div>
                </div>
              )}
            </div>
            
            {/* Menú de usuario */}
            <div className="relative">
              <button 
                className="rounded-xl bg-white/10 p-2 focus:outline-none hover:bg-white/20 transition" 
                aria-label="Usuario"
                onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }}
              >
                <UserCircle className="size-5 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-white/10 bg-[#161f36] p-2 shadow-2xl z-50 flex flex-col gap-1">
                  {esAdmin && (
                    <Link href="/equipo" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 transition" onClick={() => setMenuOpen(false)}>
                      <Users className="size-4 text-emerald-400" /> Mi Equipo
                    </Link>
                  )}
                  <Link href="/configuracion" className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-white hover:bg-white/10 transition" onClick={() => setMenuOpen(false)}>
                    <Settings className="size-4 text-emerald-400" /> Configuración
                  </Link>
                  <form action={logout}>
                    <button className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition">
                      <LogOut className="size-4" /> Salir
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Área de contenido con scroll nativo fluido */}
        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>

        {/* Barra de navegación inferior móvil rápida */}
        <nav className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t border-white/10 bg-[#0e1426]/95 backdrop-blur-md px-2 md:hidden">
          {links.slice(0, 5).map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-1 px-2 text-[10px] font-medium transition",
                  active ? "text-emerald-400" : "text-slate-400 hover:text-white"
                )}
              >
                <Icon className={cn("size-5", active && "scale-110 text-emerald-400")} />
                <span className="truncate max-w-[60px]">{label.split(" ")[0]}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
