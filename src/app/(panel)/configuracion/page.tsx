import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { createServerCaller } from "@/server/caller";
import { ConfiguracionBackups } from "@/components/backups/ConfiguracionBackups";
import { ConfiguracionDeploys } from "@/components/dashboard/ConfiguracionDeploys";
import { ConfiguracionNotificaciones } from "@/components/dashboard/ConfiguracionNotificaciones";
import { ConfiguracionProxy } from "@/components/dashboard/ConfiguracionProxy";
import { GestionCredenciales } from "@/components/dashboard/GestionCredenciales";
import { PageHeader } from "@/components/layout/PageHeader";

const SECCIONES = [
  { id: "notificaciones", etiqueta: "Notificaciones" },
  { id: "deploys", etiqueta: "Deploys" },
  { id: "proxy", etiqueta: "Proxy" },
  { id: "backups", etiqueta: "Backups" },
  { id: "credenciales", etiqueta: "Credenciales SSH" },
  { id: "webhook", etiqueta: "Webhook de GitHub" },
  { id: "sistema", etiqueta: "Sistema" },
] as const;
type Seccion = (typeof SECCIONES)[number]["id"];

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { seccion: pedida } = await searchParams;
  const seccion: Seccion =
    SECCIONES.find((s) => s.id === pedida)?.id ?? "notificaciones";

  const api = await createServerCaller();
  const [config, credenciales, configDeploys] = await Promise.all([
    api.configuracion.obtener(),
    api.credenciales.listar(),
    api.configuracion.obtenerDeploys(),
  ]);

  // Only on this section: listing the copies queries the remote destination.
  const backups =
    seccion === "backups"
      ? await Promise.all([
          api.backups.obtenerConfiguracion(),
          api.backups.historial(),
          api.backups.copias().catch((e: unknown) => ({
            error: e instanceof Error ? e.message : String(e),
          })),
        ])
      : null;

  const proxy = seccion === "proxy" ? await api.proxy.obtener() : null;

  const webhookUrl = `${env.NEXTAUTH_URL}/api/webhooks/github`;

  return (
    <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-16">
      <PageHeader comando="config" titulo="Configuración" />

      <div className="flex flex-wrap items-start gap-7">
        <nav
          aria-label="Secciones de configuración"
          className="flex flex-[1_1_180px] max-w-[220px] flex-col gap-0.5"
        >
          {SECCIONES.map((s) => {
            const activa = s.id === seccion;
            return (
              <Link
                key={s.id}
                href={`/configuracion?seccion=${s.id}`}
                aria-current={activa ? "page" : undefined}
                className={`flex items-center min-h-10 px-3 rounded-[var(--radius-md)] font-body text-[13px] ${
                  activa
                    ? "bg-elevated text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-elevated"
                }`}
              >
                {s.etiqueta}
                {s.id === "credenciales" && (
                  <span className="ml-auto text-[11px] text-text-muted">
                    {credenciales.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-[999_1_520px] min-w-0 max-w-3xl flex-col gap-4">
          {seccion === "notificaciones" && (
            <>
              <Encabezado
                titulo="Notificaciones de deploy"
                descripcion="Se envían al terminar cada deploy, rollback o auto-deploy."
              />
              <ConfiguracionNotificaciones config={config} />
            </>
          )}

          {seccion === "deploys" && (
            <>
              <Encabezado
                titulo="Deploys"
                descripcion="Límites que se aplican a todos los deploys, rollbacks y auto-deploys."
              />
              <Tarjeta>
                <ConfiguracionDeploys
                  timeoutMinutos={configDeploys.timeoutMinutos}
                />
              </Tarjeta>
            </>
          )}

          {proxy && (
            <>
              <Encabezado
                titulo="Proxy"
                descripcion="Ajustes globales de Traefik para todos los Proyectos. Los dominios y su protección se configuran en cada Proyecto."
              />
              <Tarjeta>
                <ConfiguracionProxy inicial={proxy} />
              </Tarjeta>
            </>
          )}

          {backups && (
            <>
              <Encabezado
                titulo="Backups"
                descripcion="Copia diaria cifrada de la BD del Panel y de la configuración de Traefik. Se conservan 7 diarias y 4 semanales."
              />
              <ConfiguracionBackups
                config={backups[0]}
                credenciales={credenciales}
                historial={backups[1]}
                copias={backups[2]}
              />
            </>
          )}

          {seccion === "credenciales" && (
            <>
              <Encabezado
                titulo="Credenciales SSH"
                descripcion="Claves SSH para clonar repositorios privados. La clave privada se cifra en base de datos con AES-256-GCM."
              />
              <Tarjeta>
                <GestionCredenciales credencialesIniciales={credenciales} />
              </Tarjeta>
            </>
          )}

          {seccion === "webhook" && (
            <>
              <Encabezado
                titulo="Webhook de GitHub"
                descripcion="Configura este endpoint en el repositorio (Settings → Webhooks) para lanzar auto-deploys al hacer push a la rama de cada proyecto."
              />
              <Tarjeta>
                <Campo etiqueta="Payload URL" valor={webhookUrl} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo etiqueta="Content type" valor="application/json" />
                  <Campo
                    etiqueta="Secret"
                    valor="GITHUB_WEBHOOK_SECRET (del .env)"
                  />
                </div>
                <p className="font-body text-xs text-text-muted">
                  Eventos: «Just the push event». Activa el auto-deploy en cada
                  proyecto desde su ficha.
                </p>
              </Tarjeta>
            </>
          )}

          {seccion === "sistema" && (
            <>
              <Encabezado titulo="Sistema" />
              <Tarjeta>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Campo
                    etiqueta="Sesión"
                    valor={session.user?.email ?? session.user?.name ?? "—"}
                  />
                  <Campo etiqueta="Entorno" valor={env.NODE_ENV} />
                  {env.PANEL_DOMAIN && (
                    <Campo
                      etiqueta="Dominio del panel"
                      valor={env.PANEL_DOMAIN}
                    />
                  )}
                  <Campo
                    etiqueta="Socket Docker"
                    valor={env.DOCKER_SOCKET_PATH}
                  />
                  <Campo etiqueta="Directorio repos" valor={env.REPOS_DIR} />
                </div>
              </Tarjeta>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Encabezado({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      {descripcion && (
        <p className="font-body text-[12.5px] leading-relaxed text-text-secondary">
          {descripcion}
        </p>
      )}
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface border border-border p-5">
      {children}
    </section>
  );
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{etiqueta}</span>
      <span className="px-2.5 py-1.5 rounded-[var(--radius-sm)] bg-elevated border border-border font-body text-[13px] break-all">
        {valor}
      </span>
    </div>
  );
}
