import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { NuevoClienteButton } from "@/components/dashboard/ClienteForm";
import { ClientSection } from "@/components/dashboard/ClientSection";

export default async function ProyectosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const totalProyectos = clientes.reduce((n, c) => n + c.proyectos.length, 0);
  const proyectosPlanos = clientes.flatMap((c) =>
    c.proyectos.map((p) => ({ ...p, clienteNombre: c.nombre })),
  );

  return (
    <div className="max-w-[1080px] mx-auto px-10 pt-10 pb-14">
      <header className="flex items-start gap-5 mb-7">
        <div>
          <h1 className="text-2xl font-semibold -tracking-[0.03em]">
            Proyectos
          </h1>
          <p className="font-body text-[12.5px] text-text-muted mt-[7px]">
            {totalProyectos} proyecto{totalProyectos !== 1 ? "s" : ""} ·{" "}
            {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
          </p>
        </div>
        <span className="flex-1" />
        <NuevoClienteButton />
      </header>

      <div className="mb-[30px]">
        <StatsBar proyectos={proyectosPlanos} />
      </div>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-display text-text-muted">
            No hay clientes todavía.
          </p>
          <p className="font-body text-xs text-text-muted">
            Crea un cliente y añade un proyecto para empezar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {clientes.map((c) => (
            <ClientSection key={c.id} cliente={c} />
          ))}
        </div>
      )}
    </div>
  );
}
