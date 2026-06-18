import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

const LABEL_TIPO: Record<string, string> = {
  compose: "Docker Compose",
  dockerfile: "Dockerfile",
  image: "Docker Image",
  nodejs: "Node.js",
};
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SSLBadge } from "@/components/dashboard/SSLBadge";
import { VariablesPanel } from "@/components/dashboard/VariablesPanel";
import { HistorialDeploys } from "@/components/dashboard/HistorialDeploys";
import { CredencialSelector } from "@/components/dashboard/CredencialSelector";
import { EditarProyectoButton } from "@/components/dashboard/ProyectoForm";
import { DeployPoller } from "@/components/dashboard/DeployPoller";
import { DeployLogsPanel } from "@/components/dashboard/DeployLogsPanel";
import {
  deployProyectoAction,
  detenerAction,
  iniciarAction,
  restartAction,
  rollbackAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";

export default async function DetalleProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const api = await createServerCaller();

  let proyecto: Awaited<ReturnType<typeof api.proyectos.obtener>>;
  try {
    proyecto = await api.proyectos.obtener({ id });
  } catch {
    notFound();
  }

  const [variables, deploys, credenciales] = await Promise.all([
    api.variables.listar({ proyectoId: id }),
    api.proyectos.listarDeploys({ proyectoId: id }),
    api.credenciales.listar(),
  ]);

  const isDeploying = proyecto.estado === "deploying";
  const canAct = !isDeploying;

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      <DeployPoller isDeploying={isDeploying} />
      {/* Cabecera */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-xs text-text-muted bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-0.5">
            {proyecto.clienteNombre}
          </span>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {proyecto.nombre}
          </h1>
          <StatusBadge estado={proyecto.estado} />
        </div>

        <div className="flex flex-wrap gap-2">
          <form
            action={async () => {
              "use server";
              await iniciarAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "running"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Iniciar
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await detenerAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "stopped"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Detener
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await restartAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "stopped"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Reiniciar
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await deployProyectoAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              disabled={isDeploying}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-primary-500 border border-primary-500 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              {isDeploying ? "Deploying…" : "Deploy"}
            </button>
          </form>
          <form
            action={async () => {
              "use server";
              await toggleAutoDeployAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              className={`font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border transition-colors duration-[var(--duration-fast)] ${
                proyecto.autoDeployHabilitado
                  ? "border-state-running text-state-running"
                  : "border-border text-text-muted hover:border-primary-300"
              }`}
            >
              Auto-deploy {proyecto.autoDeployHabilitado ? "ON" : "OFF"}
            </button>
          </form>
        </div>
      </div>

      {/* Deploy logs en tiempo real */}
      <DeployLogsPanel proyectoId={id} active={isDeploying} />

      {/* Información */}
      <Section
        titulo="Información"
        accion={
          <EditarProyectoButton
            proyecto={{
              id: proyecto.id,
              nombre: proyecto.nombre,
              dominio: proyecto.dominio,
              repositorioUrl: proyecto.repositorioUrl,
              rama: proyecto.rama,
              tipo: proyecto.tipo,
              puerto: proyecto.puerto,
              imagenUrl: proyecto.imagenUrl,
              dockerfilePath: proyecto.dockerfilePath,
              buildCommand: proyecto.buildCommand,
              startCommand: proyecto.startCommand,
            }}
          />
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Tipo" valor={LABEL_TIPO[proyecto.tipo]} />

          <div className="flex flex-col gap-1">
            <span className="font-body text-xs text-text-muted">Dominio</span>
            {proyecto.dominio ? (
              <div className="flex flex-col gap-1">
                <span className="font-body text-sm text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all">
                  {proyecto.dominio}
                </span>
                <SSLBadge
                  estado={await api.proyectos.estadoSSL({
                    dominio: proyecto.dominio,
                  })}
                />
              </div>
            ) : (
              <span className="font-body text-sm text-text-primary">—</span>
            )}
          </div>

          {proyecto.tipo === "image" && (
            <Campo
              label="Imagen Docker"
              valor={proyecto.imagenUrl ?? "—"}
              mono={!!proyecto.imagenUrl}
            />
          )}

          {proyecto.tipo !== "image" && (
            <Campo
              label="Repositorio"
              valor={proyecto.repositorioUrl ?? "—"}
              mono={!!proyecto.repositorioUrl}
            />
          )}

          {proyecto.tipo !== "image" && (
            <Campo label="Rama de deploy" valor={proyecto.rama} mono />
          )}

          {proyecto.tipo === "dockerfile" && (
            <Campo
              label="Ruta Dockerfile"
              valor={proyecto.dockerfilePath ?? "Dockerfile"}
              mono
            />
          )}

          {proyecto.tipo === "nodejs" && proyecto.buildCommand && (
            <Campo label="Build command" valor={proyecto.buildCommand} mono />
          )}

          {proyecto.tipo === "nodejs" && proyecto.startCommand && (
            <Campo label="Start command" valor={proyecto.startCommand} mono />
          )}

          {proyecto.puerto && (
            <Campo label="Puerto" valor={String(proyecto.puerto)} mono />
          )}

          {proyecto.ultimoDeploy && (
            <Campo
              label="Último deploy"
              valor={`${proyecto.ultimoDeploy.hace} · ${proyecto.ultimoDeploy.rama}`}
            />
          )}
        </div>
      </Section>

      {/* Credencial SSH */}
      <Section titulo="Credencial SSH">
        <CredencialSelector
          proyectoId={id}
          credencialActualId={proyecto.credencialId}
          credenciales={credenciales}
        />
      </Section>

      {/* Variables de entorno */}
      <Section titulo="Variables de entorno">
        <VariablesPanel proyectoId={id} variablesIniciales={variables} />
      </Section>

      {/* Historial de deploys */}
      <Section titulo="Historial de deploys">
        <HistorialDeploys
          deploys={deploys}
          isDeploying={isDeploying}
          onRollback={async (id) => {
            "use server";
            await rollbackAction(id);
          }}
        />
      </Section>
    </div>
  );
}

function Section({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest">
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Campo({
  label,
  valor,
  mono = false,
}: {
  label: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{label}</span>
      <span
        className={`font-body text-sm text-text-primary ${
          mono
            ? "bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all"
            : ""
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
