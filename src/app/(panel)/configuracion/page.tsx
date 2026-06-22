import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { createServerCaller } from "@/server/caller";
import { ConfiguracionNotificaciones } from "@/components/dashboard/ConfiguracionNotificaciones";
import { GestionCredenciales } from "@/components/dashboard/GestionCredenciales";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const [config, credenciales] = await Promise.all([
    api.configuracion.obtener(),
    api.credenciales.listar(),
  ]);

  const webhookUrl = `${env.NEXTAUTH_URL}/api/webhooks/github`;

  const initials = (session.user?.name ?? session.user?.email ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="max-w-2xl px-10 pt-10 pb-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold -tracking-[0.03em]">
          Configuración
        </h1>
        <p className="font-body text-[12.5px] text-text-muted mt-[7px]">
          Ajustes del panel, webhooks y credenciales
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {/* Sesión */}
        <Section titulo="Sesión">
          <div className="flex items-center gap-4">
            <div className="grid place-items-center w-10 h-10 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-display font-bold text-base shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="font-display text-sm font-semibold text-text-primary truncate">
                {session.user?.name ?? "—"}
              </span>
              <span className="font-body text-xs text-text-muted truncate">
                {session.user?.email ?? "—"}
              </span>
            </div>
          </div>
        </Section>

        {/* GitHub Webhooks */}
        <Section
          titulo="GitHub Webhooks"
          descripcion="Configura este endpoint en GitHub para activar auto-deploys al hacer push a la rama de cada proyecto."
        >
          <Campo label="Payload URL" valor={webhookUrl} mono />
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Content type" valor="application/json" mono />
            <Campo label="Secret" valor="GITHUB_WEBHOOK_SECRET" mono />
          </div>
        </Section>

        {/* Credenciales SSH */}
        <Section
          titulo="Credenciales SSH"
          descripcion="Claves SSH para clonar repositorios privados. La clave privada se cifra en base de datos con AES-256-GCM."
        >
          <GestionCredenciales credencialesIniciales={credenciales} />
        </Section>

        {/* Notificaciones */}
        <Section
          titulo="Notificaciones"
          descripcion="Alertas cuando un deploy termine en éxito o error."
        >
          <ConfiguracionNotificaciones config={config} />
        </Section>

        {/* Sistema */}
        <Section titulo="Sistema">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo
              label="Entorno"
              valor={env.NODE_ENV}
              mono
              badge={
                env.NODE_ENV === "production" ? "production" : "development"
              }
            />
            {env.PANEL_DOMAIN && (
              <Campo label="Dominio del panel" valor={env.PANEL_DOMAIN} mono />
            )}
            <Campo label="Socket Docker" valor={env.DOCKER_SOCKET_PATH} mono />
            <Campo label="Directorio repos" valor={env.REPOS_DIR} mono />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-[var(--radius-lg)] p-5">
      <div className="mb-4">
        <h2 className="font-display text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em]">
          {titulo}
        </h2>
        {descripcion && (
          <p className="font-body text-[12px] text-text-muted mt-1.5 leading-relaxed">
            {descripcion}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

const BADGE_COLOR: Record<string, string> = {
  production: "bg-state-running/15 text-state-running",
  development: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
};

function Campo({
  label,
  valor,
  mono = false,
  badge,
}: {
  label: string;
  valor: string;
  mono?: boolean;
  badge?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`font-body text-sm text-text-primary min-w-0 ${
            mono
              ? "font-mono bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all flex-1"
              : ""
          }`}
        >
          {valor}
        </span>
        {badge && (
          <span
            className={`shrink-0 font-body text-[10px] font-semibold px-1.5 py-0.5 rounded-[3px] ${BADGE_COLOR[badge] ?? "bg-border text-text-muted"}`}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
