import { logoutAction } from "@/app/(panel)/actions";
import { SidebarLink } from "./SidebarLink";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  return (
    <aside className="w-48 shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-display text-base font-bold text-text-primary tracking-wide">
          VICALBA
        </span>
      </div>
      <nav
        className="flex-1 p-2 flex flex-col gap-0.5"
        aria-label="navegación principal"
      >
        <SidebarLink href="/">Dashboard</SidebarLink>
        <SidebarLink href="/proyectos">Proyectos</SidebarLink>
        <SidebarLink href="/usuarios">Usuarios</SidebarLink>
        <SidebarLink href="/configuracion">Configuración</SidebarLink>
      </nav>
      <div className="p-2 border-t border-border flex flex-col gap-0.5">
        <ThemeToggle />
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full px-3 py-2 text-left font-body text-sm text-text-muted hover:text-text-primary hover:bg-background rounded-[var(--radius-sm)] transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
