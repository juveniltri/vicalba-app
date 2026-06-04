import { SidebarLink } from "./SidebarLink";

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
        <SidebarLink href="/configuracion">Configuración</SidebarLink>
      </nav>
    </aside>
  );
}
