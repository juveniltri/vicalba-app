import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SSLBadge } from "@/components/dashboard/SSLBadge";
import { VariablesPanel } from "@/components/dashboard/VariablesPanel";
import { HistorialDeploys } from "@/components/dashboard/HistorialDeploys";
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

  const variables = await api.variables.listar({ proyectoId: id });
  const deploys = await api.proyectos.listarDeploys({ proyectoId: id });

  const isDeploying = proyecto.estado === "deploying";
  const canAct = !isDeploying;

  return (
    <div className="max-w-3xl flex flex-col gap-8">
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
              await iniciarAction(id);
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
              await detenerAction(id);
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
              await restartAction(id);
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
              await deployProyectoAction(id);
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
              await toggleAutoDeployAction(id);
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

      {/* Información */}
      <Section titulo="Información">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <Campo
            label="Repositorio"
            valor={proyecto.repositorioUrl ?? "—"}
            mono={!!proyecto.repositorioUrl}
          />
          <Campo label="Rama de deploy" valor={proyecto.rama} mono />
          <div className="flex flex-col gap-1">
            <span className="font-body text-xs text-text-muted">Servicios</span>
            <div className="flex flex-wrap gap-2">
              {proyecto.servicios.map((s) => (
                <div key={s.nombre} className="flex items-center gap-1.5">
                  <StatusBadge estado={s.estado} />
                  <span className="font-body text-xs text-text-primary">
                    {s.nombre}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {proyecto.ultimoDeploy && (
            <Campo
              label="Último deploy"
              valor={`${proyecto.ultimoDeploy.hace} · ${proyecto.ultimoDeploy.rama}`}
            />
          )}
        </div>
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
          onRollback={rollbackAction}
        />
      </Section>
    </div>
  );
}

function Section({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
        {titulo}
      </h2>
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
