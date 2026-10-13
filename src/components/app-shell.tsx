"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Bell, Boxes, FileText, Landmark, ShieldCheck, ShoppingCart, Users, UserCircle, LogOut, Store, Settings } from "lucide-react";
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
  
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  
  return (
    <div className="flex h-screen gap-0 overflow-hidden" onClick={() => { if(menuOpen) setMenuOpen(false); if(notifOpen) setNotifOpen(false); }}>
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/5 bg-[#0e1426] p-3">
        <div className="mb-6 flex items-center gap-2 px-3 py-3 text-emerald-400">
          <Store className="size-7" />
          <span className="text-lg font-bold text-white">Kiosco POS</span>
        </div>
        <nav className="flex-1 space-y-1">
          {todos.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white",
                path.startsWith(href) && "bg-white/10 text-white shadow-inner"
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <form action={logout}>
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-red-500/10 hover:text-red-400">
            <LogOut className="size-4" /> Salir
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-4 relative">
          <h1 className="text-xl font-semibold text-white">{titles[path] ?? "Kiosco POS"}</h1>
          <div className="flex items-center gap-3 text-slate-400" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <button 
                className="relative rounded-full p-2 hover:bg-white/5 focus:outline-none" 
                aria-label="Notificaciones"
                onClick={() => { setNotifOpen(!notifOpen); setMenuOpen(false); }}
              >
                <Bell className="size-5" />
                <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-[#161f36] p-4 shadow-xl z-50">
                  <h3 className="mb-2 text-sm font-semibold text-white">Notificaciones</h3>
                  <div className="text-sm text-slate-400">No tienes notificaciones nuevas.</div>
                </div>
              )}
            </div>
            
            <div className="relative">
              <button 
                className="rounded-full bg-white/10 p-2 focus:outline-none hover:bg-white/20" 
                aria-label="Usuario"
                onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }}
              >
                <UserCircle className="size-5 text-white" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#161f36] p-2 shadow-xl z-50 flex flex-col gap-1">
                  {esAdmin && (
                    <Link href="/equipo" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10" onClick={() => setMenuOpen(false)}>
                      <Users className="size-4" /> Mi Equipo
                    </Link>
                  )}
                  <Link href="/configuracion" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10" onClick={() => setMenuOpen(false)}>
                    <Settings className="size-4" /> Configuración
                  </Link>
                  <form action={logout}>
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10">
                      <LogOut className="size-4" /> Salir
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 px-6 pb-6">{children}</main>
      </div>
    </div>
  );
}
