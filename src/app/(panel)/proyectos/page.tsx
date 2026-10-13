import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { NuevoClienteButton } from "@/components/dashboard/ClienteForm";
import { ProyectosExplorer } from "@/components/dashboard/ProyectosExplorer";
import { DeployPoller } from "@/components/dashboard/DeployPoller";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function ProyectosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const hayDeployEnCurso = clientes.some((c) =>
    c.proyectos.some((p) => p.estado === "deploying"),
  );

  return (
    <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-14">
      <DeployPoller isDeploying={hayDeployEnCurso} />
      <PageHeader comando="ls proyectos" titulo="Proyectos">
        <NuevoClienteButton />
      </PageHeader>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="font-display text-text-secondary">
            No hay clientes todavía.
          </p>
          <p className="font-body text-xs text-text-muted">
            Crea un cliente y añade un proyecto para empezar.
          </p>
        </div>
      ) : (
        <ProyectosExplorer clientes={clientes} />
      )}
    </div>
  );
}
