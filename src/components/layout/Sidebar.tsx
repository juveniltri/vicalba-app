"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/(panel)/actions";
import { ThemeToggle } from "./ThemeToggle";
import {
  IconGrid,
  IconDeploy,
  IconUsers,
  IconGear,
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
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex flex-col bg-background border-r border-border p-[22px_14px] min-h-0 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 pt-1 pb-[22px]">
        <span className="grid place-items-center w-[30px] h-[30px] rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-bold text-base shrink-0">
          v
        </span>
        <span className="font-display font-semibold text-[15px] -tracking-[0.02em] min-w-0">
          vicalba
          <small className="block font-body text-[10px] font-normal text-text-muted mt-px">
            deploy panel
          </small>
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5" aria-label="navegación principal">
        <div className="font-body text-[10px] uppercase tracking-[0.12em] text-text-muted px-2 pt-1 pb-1.5">
          Plataforma
        </div>
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-[11px] p-[9px] rounded-[var(--radius-md)] text-[13.5px] font-medium transition-colors duration-[var(--duration-fast)] ${
                active
                  ? "text-text-primary bg-surface"
                  : "text-text-muted hover:text-text-primary hover:bg-surface"
              }`}
            >
              <Icon
                className={`w-[17px] h-[17px] shrink-0 ${active ? "text-[var(--color-accent)]" : ""}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-0.5 mt-auto pt-3 border-t border-border">
        <ThemeToggle />
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full px-3 py-2 text-left font-body text-sm text-text-muted hover:text-text-primary hover:bg-surface rounded-[var(--radius-sm)] transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
