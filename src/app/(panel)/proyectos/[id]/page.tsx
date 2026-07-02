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
import { AbrirUrlBoton } from "@/components/dashboard/AbrirUrlBoton";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SSLBadge } from "@/components/dashboard/SSLBadge";
import { VariablesPanel } from "@/components/dashboard/VariablesPanel";
import { HistorialDeploys } from "@/components/dashboard/HistorialDeploys";
import { CredencialSelector } from "@/components/dashboard/CredencialSelector";
import { VolumenesPanel } from "@/components/dashboard/VolumenesPanel";
import {
  EditarProyectoButton,
  EliminarProyectoButton,
} from "@/components/dashboard/ProyectoForm";
import { DeployPoller } from "@/components/dashboard/DeployPoller";
import { DeployLogsPanel } from "@/components/dashboard/DeployLogsPanel";
import { ComposeEditor } from "@/components/dashboard/ComposeEditor";
import { ProjectActionButton } from "@/components/dashboard/ProjectActionButton";
import {
  deployProyectoAction,
  detenerAction,
  iniciarAction,
  restartAction,
  rollbackAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";
import { IconRedeploy, IconStop, IconCheck } from "@/components/ui/icons";

const ghostBtn =
  "inline-flex items-center gap-1.5 font-display text-xs font-medium px-3 py-1.5 rounded-[var(--radius-md)] border border-border bg-transparent text-text-muted hover:text-text-primary hover:bg-elevated transition-colors disabled:opacity-40 disabled:pointer-events-none";

const primaryBtn =
  "inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:pointer-events-none";

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

  const [variables, deploys, credenciales, volumenes, estadoSSL] =
    await Promise.all([
      api.variables.listar({ proyectoId: id }),
      api.proyectos.listarDeploys({ proyectoId: id }),
      api.credenciales.listar(),
      api.volumenes.listar({ proyectoId: id }),
      proyecto.dominio
        ? api.proyectos.estadoSSL({ dominio: proyecto.dominio })
        : Promise.resolve(null),
    ]);

  const isDeploying = proyecto.estado === "deploying";
  const canAct = !isDeploying;

  return (
    <div className="px-10 pt-8 pb-16">
      <DeployPoller isDeploying={isDeploying} />

      {/* ── Cabecera ───────────────────────────────────────────── */}
      <div className="mb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-body text-[11.5px] text-text-muted">
            {proyecto.clienteNombre}
          </span>
          <span className="text-text-muted/40 text-xs">/</span>
          <span className="font-body text-[11.5px] text-text-primary font-medium">
            {proyecto.nombre}
          </span>
        </div>

        {/* Título + badge */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <h1 className="font-display text-2xl font-bold -tracking-[0.03em] text-text-primary">
            {proyecto.nombre}
          </h1>
          <StatusBadge estado={proyecto.estado} />
          {proyecto.dominio && (
            <AbrirUrlBoton
              dominio={proyecto.dominio}
              sslActivo={estadoSSL?.activo ?? null}
            />
          )}
        </div>

        {/* Barra de acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          <ProjectActionButton
            action={async () => {
              "use server";
              const result = await iniciarAction(id);
              revalidatePath(`/proyectos/${id}`);
              return result;
            }}
            label="Iniciar"
            pendingLabel="Iniciando…"
            successMessage="Proyecto iniciado"
            disabled={!canAct || proyecto.estado === "running"}
            className={ghostBtn}
          >
            <IconCheck className="w-[13px] h-[13px]" />
          </ProjectActionButton>

          <ProjectActionButton
            action={async () => {
              "use server";
              const result = await detenerAction(id);
              revalidatePath(`/proyectos/${id}`);
              return result;
            }}
            label="Detener"
            pendingLabel="Deteniendo…"
            successMessage="Proyecto detenido"
            disabled={!canAct || proyecto.estado === "stopped"}
            className={ghostBtn}
          >
            <IconStop className="w-[13px] h-[13px]" />
          </ProjectActionButton>

          <ProjectActionButton
            action={async () => {
              "use server";
              const result = await restartAction(id);
              revalidatePath(`/proyectos/${id}`);
              return result;
            }}
            label="Reiniciar"
            pendingLabel="Reiniciando…"
            successMessage="Proyecto reiniciado"
            disabled={!canAct || proyecto.estado === "stopped"}
            className={ghostBtn}
          >
            <IconRedeploy className="w-[13px] h-[13px]" />
          </ProjectActionButton>

          <form
            action={async () => {
              "use server";
              await toggleAutoDeployAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button
              type="submit"
              className={`${ghostBtn} ${
                proyecto.autoDeployHabilitado
                  ? "border-state-running text-state-running hover:text-state-running"
                  : ""
              }`}
            >
              Auto-deploy{" "}
              <span
                className={`text-[10px] font-bold px-1 py-0.5 rounded-[3px] ${
                  proyecto.autoDeployHabilitado
                    ? "bg-state-running/15 text-state-running"
                    : "bg-border text-text-muted"
                }`}
              >
                {proyecto.autoDeployHabilitado ? "ON" : "OFF"}
              </span>
            </button>
          </form>

          <form
            action={async () => {
              "use server";
              await deployProyectoAction(id);
              revalidatePath(`/proyectos/${id}`);
            }}
          >
            <button type="submit" disabled={isDeploying} className={primaryBtn}>
              <IconRedeploy className="w-[13px] h-[13px]" />
              {isDeploying ? "Deploying…" : "Deploy"}
            </button>
          </form>
        </div>
      </div>

      {/* ── Deploy logs en tiempo real ──────────────────────────── */}
      <DeployLogsPanel proyectoId={id} active={isDeploying} />

      {/* ── Grid de secciones ──────────────────────────────────── */}
      <div className="flex flex-col gap-6 max-w-4xl">
        {/* Información */}
        <Card
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
                <div className="flex flex-col gap-1.5">
                  <span className="font-body text-sm text-text-primary font-mono bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all">
                    {proyecto.dominio}
                  </span>
                  {estadoSSL && <SSLBadge estado={estadoSSL} />}
                </div>
              ) : (
                <span className="font-body text-sm text-text-muted">—</span>
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
        </Card>

        {/* Credencial SSH */}
        <Card titulo="Credencial SSH">
          <CredencialSelector
            proyectoId={id}
            credencialActualId={proyecto.credencialId}
            credenciales={credenciales}
          />
        </Card>

        {/* Compose editor — solo para tipo compose */}
        {proyecto.tipo === "compose" && (
          <Card titulo="Docker Compose">
            <ComposeEditor
              proyectoId={id}
              composeContentInicial={proyecto.composeContent}
              repositorioUrl={proyecto.repositorioUrl}
            />
          </Card>
        )}

        {/* Variables de entorno */}
        <Card titulo="Variables de entorno">
          <VariablesPanel proyectoId={id} variablesIniciales={variables} />
        </Card>

        {/* Volúmenes */}
        <Card titulo="Volúmenes">
          <VolumenesPanel proyectoId={id} volumenesIniciales={volumenes} />
        </Card>

        {/* Historial de deploys */}
        <Card titulo="Historial de deploys">
          <HistorialDeploys
            deploys={deploys}
            isDeploying={isDeploying}
            onRollback={async (deployId) => {
              "use server";
              await rollbackAction(deployId);
            }}
          />
        </Card>

        {/* Zona peligrosa */}
        <div className="flex items-center justify-between px-5 py-4 bg-surface border border-state-error/30 rounded-[var(--radius-lg)]">
          <div>
            <p className="font-display text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
              Zona peligrosa
            </p>
            <p className="font-body text-xs text-text-muted mt-1">
              Eliminar el proyecto y todos sus datos. Esta acción no se puede
              deshacer.
            </p>
          </div>
          <EliminarProyectoButton
            proyectoId={proyecto.id}
            proyectoNombre={proyecto.nombre}
          />
        </div>
      </div>
    </div>
  );
}

function Card({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[var(--radius-lg)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
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
            ? "font-mono bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all"
            : ""
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
