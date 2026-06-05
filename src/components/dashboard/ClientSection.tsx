import type { ClienteConProyectos } from "@/lib/schemas/dashboard";
import { ProjectCard } from "./ProjectCard";

export function ClientSection({ cliente }: { cliente: ClienteConProyectos }) {
  return (
    <section aria-label={cliente.nombre}>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest whitespace-nowrap">
          {cliente.nombre}
        </h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cliente.proyectos.map((proyecto) => (
          <ProjectCard key={proyecto.id} proyecto={proyecto} />
        ))}
      </div>
    </section>
  );
}
