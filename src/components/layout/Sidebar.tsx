"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(panel)/actions";
import { useFijados } from "@/hooks/useFijados";
import { EstadoMarca } from "@/components/dashboard/StatusBadge";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette, type ProyectoIndice } from "./CommandPalette";
import {
  IconGrid,
  IconDeploy,
  IconUsers,
  IconGear,
  IconClock,
} from "@/components/ui/icons";

const nav = [
  { href: "/", label: "Dashboard", icon: IconGrid, exact: true },
  { href: "/proyectos", label: "Proyectos", icon: IconDeploy, exact: false },
  { href: "/usuarios", label: "Usuarios", icon: IconUsers, exact: false },
  {
    href: "/configuracion",
    label: "Configuración",
    icon: IconGear,
    exact: false,
  },
  { href: "/novedades", label: "Novedades", icon: IconClock, exact: false },
];

function iniciales(texto: string): string {
  return texto
    .split("@")[0]!
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Sidebar({
  proyectos,
  usuario,
}: {
  proyectos: ProyectoIndice[];
  usuario: { nombre: string | null; email: string | null };
}) {
  const pathname = usePathname();
  const { fijados } = useFijados();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const proyectosFijados = fijados
    .map((id) => proyectos.find((p) => p.id === id))
    .filter((p): p is ProyectoIndice => !!p);
  const nombreVisible = usuario.nombre ?? usuario.email ?? "Usuario";

  function isActive(href: string, exact: boolean) {
    return exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex flex-col gap-6 bg-sidebar border-b md:border-b-0 md:border-r border-border px-3.5 py-4 md:py-5 min-h-0 md:h-screen md:overflow-y-auto">
      <div className="flex items-center gap-2.5 px-2">
        <span className="font-display text-[17px] font-bold -tracking-[0.02em]">
          vicalba
        </span>
        <span
          className="w-2 h-4 bg-[var(--color-accent)] animate-pulse"
          aria-hidden="true"
        />
        <button
          type="button"
          aria-expanded={menuAbierto}
          aria-controls="menu-lateral"
          onClick={() => setMenuAbierto((v) => !v)}
          className="md:hidden ml-auto inline-flex items-center min-h-10 px-3 rounded-[var(--radius-md)] border border-border-strong font-body text-xs text-text-secondary"
        >
          Menú
        </button>
      </div>

      <div
        id="menu-lateral"
        className={`${menuAbierto ? "flex" : "hidden"} md:flex flex-1 flex-col gap-6 min-h-0`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setMenuAbierto(false);
        }}
      >
        <CommandPalette proyectos={proyectos} />

        <nav
          className="flex flex-col gap-0.5"
          aria-label="navegación principal"
        >
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 min-h-10 px-3 rounded-[var(--radius-md)] font-body text-[13px] transition-colors duration-[var(--duration-fast)] ${
                  active
                    ? "bg-elevated text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                }`}
              >
                <Icon
                  className={`w-[15px] h-[15px] shrink-0 ${active ? "text-[var(--color-accent)]" : ""}`}
                />
                {label}
                {href === "/proyectos" && (
                  <span className="ml-auto text-[11px] text-text-muted">
                    {proyectos.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-0.5">
          <span
            id="fijados-titulo"
            className="px-3 pb-1.5 font-body text-[10.5px] uppercase tracking-[0.08em] text-text-muted"
          >
            Fijados
          </span>
          {proyectosFijados.length === 0 ? (
            <p className="px-3 font-body text-[11.5px] leading-relaxed text-text-muted">
              Fija proyectos desde su página para tenerlos a mano.
            </p>
          ) : (
            <ul aria-label="Fijados" className="flex flex-col gap-0.5">
              {proyectosFijados.map((p) => {
                const href = `/proyectos/${p.id}`;
                return (
                  <li key={p.id}>
                    <Link
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      className={`flex items-center gap-2.5 min-h-9 px-3 rounded-[var(--radius-md)] font-body text-[12.5px] ${
                        pathname === href
                          ? "bg-elevated text-text-primary"
                          : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                      }`}
                    >
                      <EstadoMarca estado={p.estado} />
                      <span className="truncate">
                        {p.cliente} / {p.nombre}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-1 pt-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <span
              className="grid place-items-center size-7 shrink-0 rounded-full bg-elevated font-body text-[11px] font-semibold"
              aria-hidden="true"
            >
              {iniciales(nombreVisible)}
            </span>
            <span className="min-w-0 truncate font-body text-[12.5px]">
              {nombreVisible}
            </span>
          </div>
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full min-h-9 px-3 text-left font-body text-[12.5px] text-text-muted hover:text-text-primary hover:bg-elevated rounded-[var(--radius-md)] transition-colors"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
