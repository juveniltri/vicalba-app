// src/app/(panel)/page.tsx
import { ClientSection } from "@/components/dashboard/ClientSection";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { createServerCaller } from "@/server/caller";

export default async function DashboardPage() {
  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectosPlanos = clientes.flatMap((c) => c.proyectos);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Dashboard
      </h1>
      <StatsBar proyectos={proyectosPlanos} />
      <div className="flex flex-col gap-8">
        {clientes.map((cliente) => (
          <ClientSection key={cliente.slug} cliente={cliente} />
        ))}
      </div>
    </div>
  );
}
