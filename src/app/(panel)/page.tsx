import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { auth } from "@/lib/auth";
import { comprobarSalud } from "@/lib/health";
import { diasHasta } from "@/lib/formatHace";
import { createServerCaller } from "@/server/caller";
import { MetricasSistema } from "@/components/metricas-sistema";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { AtencionPanel } from "@/components/dashboard/AtencionPanel";
import { DeploysRecientes } from "@/components/dashboard/DeploysRecientes";
import { EstadoVps } from "@/components/dashboard/EstadoVps";
import { DeployPoller } from "@/components/dashboard/DeployPoller";
import { PageHeader, botonSecundario } from "@/components/layout/PageHeader";

// Traefik renews 30 days before expiry: under 21 days left means renewal is failing.
const DIAS_AVISO_CERTIFICADO = 21;

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const [clientes, actividad, salud] = await Promise.all([
    api.proyectos.listar(),
    api.proyectos.actividad(),
    comprobarSalud(),
  ]);
  const proyectos = clientes.flatMap((c) =>
    c.proyectos.map((p) => ({ ...p, clienteNombre: c.nombre })),
  );
  const certificadosPorCaducar = proyectos
    .filter((p) => p.ssl?.caducaEn)
    .map((p) => ({
      proyectoId: p.id,
      nombre: `${p.clienteNombre} / ${p.nombre}`,
      dias: diasHasta(p.ssl!.caducaEn!),
    }))
    .filter((c) => c.dias < DIAS_AVISO_CERTIFICADO)
    .sort((a, b) => a.dias - b.dias);
  const nombre = session.user?.name?.split(" ")[0];
  const hayDeployEnCurso = actividad.atencion.some(
    (p) => p.estado === "deploying",
  );

  return (
    <div className="flex flex-col gap-7 px-5 md:px-10 pt-7 pb-14">
      <DeployPoller isDeploying={hayDeployEnCurso} />
      <PageHeader
        comando="estado"
        titulo={nombre ? `Hola, ${nombre}` : "Dashboard"}
      >
        <Link href="/proyectos" className={botonSecundario}>
          Ver proyectos
        </Link>
      </PageHeader>

      <AtencionPanel proyectos={actividad.atencion} />

      <StatsBar proyectos={proyectos} clientes={clientes.length} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex-[2_1_560px] min-w-0">
          <DeploysRecientes deploys={actividad.recientes} />
        </div>
        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-5">
          <EstadoVps
            checks={salud.checks}
            version={salud.version}
            certificados={certificadosPorCaducar}
          />
          <MetricasSistema />
        </div>
      </div>
    </div>
  );
}
