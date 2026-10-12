import Link from "next/link";
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
import { diasHasta, formatHace, shaCorto } from "@/lib/formatHace";
import { createServerCaller } from "@/server/caller";
import { AbrirUrlBoton } from "@/components/dashboard/AbrirUrlBoton";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
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
import { RESULTADO_DEPLOY } from "@/components/dashboard/DeploysRecientes";
import {
  BotonFijar,
  BotonLogsContenedor,
} from "@/components/dashboard/AccionesProyecto";
import { botonPrimario, botonSecundario } from "@/components/layout/PageHeader";
import {
  deployProyectoAction,
  detenerAction,
  iniciarAction,
  restartAction,
  rollbackAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";
import { IconRedeploy, IconStop, IconCheck } from "@/components/ui/icons";

const PESTANAS = [
  "resumen",
  "deploys",
  "variables",
  "volumenes",
  "compose",
  "ajustes",
] as const;
type Pestana = (typeof PESTANAS)[number];

export default async function DetalleProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const { tab } = await searchParams;
  const api = await createServerCaller();

  let proyecto: Awaited<ReturnType<typeof api.proyectos.obtener>>;
  try {
    proyecto = await api.proyectos.obtener({ id });
  } catch {
    notFound();
  }

  const [variables, deploys, credenciales, volumenes] = await Promise.all([
    api.variables.listar({ proyectoId: id }),
    api.proyectos.listarDeploys({ proyectoId: id }),
    api.credenciales.listar(),
    api.volumenes.listar({ proyectoId: id }),
  ]);

  const disponibles = PESTANAS.filter(
    (p) => p !== "compose" || proyecto.tipo === "compose",
  );
  const pestana: Pestana = disponibles.includes(tab as Pestana)
    ? (tab as Pestana)
    : "resumen";
  const isDeploying = proyecto.estado === "deploying";
  const canAct = !isDeploying;
  const enProduccion = deploys.find((d) => d.resultado === "exito");
  const credencial = credenciales.find((c) => c.id === proyecto.credencialId);
  const etiquetas: Record<Pestana, string> = {
    resumen: "Resumen",
    deploys: `Deploys`,
    variables: "Variables",
    volumenes: "Volúmenes",
    compose: "Compose",
    ajustes: "Ajustes",
  };
  const contadores: Partial<Record<Pestana, number>> = {
    deploys: deploys.length,
    variables: variables.length,
    volumenes: volumenes.length,
  };

  return (
    <div className="flex flex-col gap-5 px-5 md:px-10 pt-6 pb-14">
      <DeployPoller isDeploying={isDeploying} />

      <nav
        aria-label="Ruta"
        className="flex flex-wrap items-center gap-2 font-body text-xs text-text-muted"
      >
        <Link
          href="/proyectos"
          className="text-text-secondary hover:text-text-primary"
        >
          Proyectos
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-secondary">{proyecto.clienteNombre}</span>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary" aria-current="page">
          {proyecto.nombre}
        </span>
      </nav>

      <header className="flex flex-wrap items-center gap-3.5">
        <h1 className="font-display text-[30px] font-bold leading-tight -tracking-[0.03em]">
          {proyecto.nombre}
        </h1>
        <StatusBadge estado={proyecto.estado} />
        {proyecto.dominio && (
          <span className="inline-flex items-center gap-1.5 font-body text-[12.5px] text-text-secondary">
            {proyecto.dominio}
            <AbrirUrlBoton
              dominio={proyecto.dominio}
              sslActivo={proyecto.ssl?.activo ?? null}
            />
          </span>
        )}
        <BotonFijar proyectoId={proyecto.id} />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <BotonLogsContenedor
            proyectoId={proyecto.id}
            proyectoNombre={proyecto.nombre}
          />
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
            className={botonSecundario}
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
            className={botonSecundario}
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
            className={botonSecundario}
          >
            <IconRedeploy className="w-[13px] h-[13px]" />
          </ProjectActionButton>
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
              className={botonPrimario}
            >
              <IconRedeploy className="w-[13px] h-[13px]" />
              {isDeploying ? "Desplegando…" : "Deploy"}
            </button>
          </form>
        </div>
      </header>

      <nav
        aria-label="Secciones del proyecto"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {disponibles.map((p) => {
          const activa = p === pestana;
          return (
            <Link
              key={p}
              href={
                p === "resumen"
                  ? `/proyectos/${id}`
                  : `/proyectos/${id}?tab=${p}`
              }
              aria-current={activa ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 min-h-11 px-3.5 -mb-px border-b-2 font-body text-[13px] transition-colors ${
                activa
                  ? "border-[var(--color-accent)] text-text-primary font-semibold"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {etiquetas[p]}
              {contadores[p] !== undefined && (
                <span className="text-text-muted">{contadores[p]}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {pestana === "resumen" && (
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex-[2_1_560px] min-w-0">
            {isDeploying ? (
              <DeployLogsPanel proyectoId={id} active />
            ) : (
              <UltimoDeploy proyectoId={id} deploy={deploys[0]} />
            )}
          </div>

          <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
            <Card titulo="Proyecto">
              <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 font-body text-xs">
                <Dato etiqueta="Tipo">{LABEL_TIPO[proyecto.tipo]}</Dato>
                {proyecto.tipo === "image" ? (
                  <Dato etiqueta="Imagen">{proyecto.imagenUrl ?? "—"}</Dato>
                ) : (
                  <>
                    <Dato etiqueta="Repositorio">
                      {proyecto.repositorioUrl?.replace(
                        /^https?:\/\/(www\.)?github\.com\//,
                        "",
                      ) ??
                        (proyecto.composeContent ? "compose del panel" : "—")}
                    </Dato>
                    <Dato etiqueta="Rama">{proyecto.rama}</Dato>
                  </>
                )}
                <Dato etiqueta="En producción">
                  <span className="text-accent-text">
                    {shaCorto(enProduccion?.sha) ?? "—"}
                  </span>
                </Dato>
                <Dato etiqueta="Red">
                  cliente-{proyecto.clienteSlug}-network
                </Dato>
                {proyecto.ssl && (
                  <Dato etiqueta="Certificado">
                    <EstadoCertificado ssl={proyecto.ssl} />
                  </Dato>
                )}
                {proyecto.tipo !== "image" && (
                  <Dato etiqueta="Credencial SSH">
                    {credencial?.nombre ?? "ninguna"}
                  </Dato>
                )}
              </dl>
              <form
                className="flex items-center gap-3 mt-4 pt-3 border-t border-border"
                action={async () => {
                  "use server";
                  await toggleAutoDeployAction(id);
                  revalidatePath(`/proyectos/${id}`);
                }}
              >
                <span className="flex flex-col gap-0.5 font-body text-[12.5px]">
                  Auto-deploy
                  <span className="text-[11px] text-text-muted">
                    al hacer push a {proyecto.rama}
                  </span>
                </span>
                <button
                  type="submit"
                  role="switch"
                  aria-checked={proyecto.autoDeployHabilitado}
                  aria-label="Auto-deploy"
                  className={`ml-auto relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    proyecto.autoDeployHabilitado
                      ? "bg-state-running"
                      : "bg-border-strong"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                      proyecto.autoDeployHabilitado
                        ? "translate-x-[22px]"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </form>
            </Card>

            <Card
              titulo="Deploys recientes"
              accion={
                <Link
                  href={`/proyectos/${id}?tab=deploys`}
                  className="font-body text-xs text-accent-text"
                >
                  Todos
                </Link>
              }
            >
              {deploys.length === 0 ? (
                <p className="font-body text-xs text-text-muted">
                  Sin deploys registrados.
                </p>
              ) : (
                <ul className="m-0 -mx-5 list-none font-body text-xs">
                  {deploys.slice(0, 4).map((d) => {
                    const r = RESULTADO_DEPLOY[d.resultado];
                    return (
                      <li
                        key={d.id}
                        className={`flex items-center gap-2.5 px-5 py-2 ${
                          d.id === enProduccion?.id ? "bg-elevated" : ""
                        }`}
                      >
                        <span className={r.clase} aria-label={r.texto}>
                          {r.simbolo}
                        </span>
                        <span className="text-accent-text">
                          {shaCorto(d.sha) ?? "—"}
                        </span>
                        <span className="text-text-muted">
                          {formatHace(new Date(d.iniciadoEn))} · {d.origen}
                        </span>
                        {d.id === enProduccion?.id && (
                          <span className="ml-auto text-[10.5px] font-semibold text-running-text">
                            EN PRODUCCIÓN
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {pestana === "deploys" && (
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
      )}

      {pestana === "variables" && (
        <Card titulo="Variables de entorno">
          <VariablesPanel proyectoId={id} variablesIniciales={variables} />
        </Card>
      )}

      {pestana === "volumenes" && (
        <Card titulo="Volúmenes">
          <VolumenesPanel proyectoId={id} volumenesIniciales={volumenes} />
        </Card>
      )}

      {pestana === "compose" && (
        <Card titulo="Docker Compose">
          <ComposeEditor
            proyectoId={id}
            composeContentInicial={proyecto.composeContent}
            repositorioUrl={proyecto.repositorioUrl}
          />
        </Card>
      )}

      {pestana === "ajustes" && (
        <div className="flex max-w-4xl flex-col gap-5">
          <Card
            titulo="Configuración del proyecto"
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
            <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 gap-4 font-body text-xs">
              <Campo
                etiqueta="Tipo"
                valor={LABEL_TIPO[proyecto.tipo] ?? proyecto.tipo}
              />
              <Campo
                etiqueta="Dominio"
                valor={proyecto.dominio ?? "—"}
                mono={!!proyecto.dominio}
              />
              {proyecto.tipo === "image" ? (
                <Campo
                  etiqueta="Imagen Docker"
                  valor={proyecto.imagenUrl ?? "—"}
                  mono
                />
              ) : (
                <>
                  <Campo
                    etiqueta="Repositorio"
                    valor={proyecto.repositorioUrl ?? "—"}
                    mono
                  />
                  <Campo etiqueta="Rama de deploy" valor={proyecto.rama} mono />
                </>
              )}
              {proyecto.tipo === "dockerfile" && (
                <Campo
                  etiqueta="Ruta Dockerfile"
                  valor={proyecto.dockerfilePath ?? "Dockerfile"}
                  mono
                />
              )}
              {proyecto.tipo === "nodejs" && proyecto.buildCommand && (
                <Campo
                  etiqueta="Build command"
                  valor={proyecto.buildCommand}
                  mono
                />
              )}
              {proyecto.tipo === "nodejs" && proyecto.startCommand && (
                <Campo
                  etiqueta="Start command"
                  valor={proyecto.startCommand}
                  mono
                />
              )}
              {proyecto.puerto && (
                <Campo etiqueta="Puerto" valor={String(proyecto.puerto)} mono />
              )}
            </dl>
          </Card>

          <Card titulo="Credencial SSH">
            <CredencialSelector
              proyectoId={id}
              credencialActualId={proyecto.credencialId}
              credenciales={credenciales}
            />
          </Card>

          <section className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 rounded-[var(--radius-lg)] bg-surface border border-error-border">
            <div>
              <h2 className="font-display text-[15px] font-semibold">
                Zona peligrosa
              </h2>
              <p className="mt-1 font-body text-xs text-text-secondary">
                Eliminar el proyecto y todos sus datos. Esta acción no se puede
                deshacer.
              </p>
            </div>
            <EliminarProyectoButton
              proyectoId={proyecto.id}
              proyectoNombre={proyecto.nombre}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function UltimoDeploy({
  proyectoId,
  deploy,
}: {
  proyectoId: string;
  deploy:
    | {
        resultado: keyof typeof RESULTADO_DEPLOY;
        sha: string | null;
        rama: string;
        origen: string;
        iniciadoEn: Date | string;
        output: string | null;
      }
    | undefined;
}) {
  if (!deploy) {
    return (
      <Card titulo="Último deploy">
        <p className="font-body text-[12.5px] text-text-secondary">
          Este proyecto todavía no se ha desplegado. Pulsa «Deploy» para lanzar
          el primero.
        </p>
      </Card>
    );
  }
  const r = RESULTADO_DEPLOY[deploy.resultado];
  const final = (deploy.output ?? "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(-12)
    .join("\n");
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface border border-border">
      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5 border-b border-border">
        <h2 className="font-display text-[15px] font-semibold">
          Último deploy
        </h2>
        <span className={`font-body text-xs ${r.clase}`}>
          <span aria-hidden="true">{r.simbolo} </span>
          {r.texto}
        </span>
        <span className="font-body text-xs text-text-secondary">
          {deploy.rama} @{" "}
          <span className="text-accent-text">
            {shaCorto(deploy.sha) ?? "—"}
          </span>{" "}
          · {deploy.origen} · {formatHace(new Date(deploy.iniciadoEn))}
        </span>
        <Link
          href={`/proyectos/${proyectoId}?tab=deploys`}
          className="ml-auto font-body text-xs text-accent-text"
        >
          Ver log completo
        </Link>
      </div>
      <pre className="m-0 max-h-[420px] overflow-auto px-[18px] py-4 bg-terminal font-body text-xs leading-[1.65] text-terminal-text whitespace-pre-wrap break-all">
        {final || "Sin salida registrada."}
      </pre>
    </section>
  );
}

function EstadoCertificado({
  ssl,
}: {
  ssl: { activo: boolean; caducaEn: string | null };
}) {
  if (!ssl.activo)
    return <span className="text-error-text">sin certificado</span>;
  if (!ssl.caducaEn) return <span className="text-running-text">válido</span>;
  const dias = diasHasta(ssl.caducaEn);
  return (
    <span className={dias < 21 ? "text-deploying-text" : "text-running-text"}>
      válido · {dias} día{dias === 1 ? "" : "s"}
    </span>
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
    <section className="min-w-0 rounded-[var(--radius-lg)] bg-surface border border-border px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="font-display text-[15px] font-semibold">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-text-muted">{etiqueta}</dt>
      <dd className="m-0 min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function Campo({
  etiqueta,
  valor,
  mono = false,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-text-muted">{etiqueta}</dt>
      <dd
        className={`m-0 text-[13px] ${
          mono
            ? "px-2 py-1 rounded-[var(--radius-sm)] bg-elevated border border-border break-all"
            : ""
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
