// src/app/(panel)/page.tsx
import { redirect } from "next/navigation";
import { NuevoClienteButton } from "@/components/dashboard/ClienteForm";
import { ClientSection } from "@/components/dashboard/ClientSection";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectosPlanos = clientes.flatMap((c) => c.proyectos);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Dashboard
        </h1>
        <NuevoClienteButton />
      </div>
      <StatsBar proyectos={proyectosPlanos} />
      <div className="flex flex-col gap-8">
        {clientes.map((cliente) => (
          <ClientSection key={cliente.slug} cliente={cliente} />
        ))}
      </div>
    </div>
  );
}
