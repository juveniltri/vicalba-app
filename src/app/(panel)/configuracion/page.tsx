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

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Configuración
      </h1>

      <div className="flex flex-col gap-6">
        <Section titulo="Sesión">
          <Campo label="Usuario" valor={session.user?.name ?? "—"} />
          <Campo label="Email" valor={session.user?.email ?? "—"} />
        </Section>

        <Section titulo="GitHub Webhooks">
          <p className="font-body text-xs text-text-muted mb-3">
            Configura este endpoint en GitHub para activar auto-deploys al hacer
            push a la rama configurada de cada proyecto.
          </p>
          <Campo label="Payload URL" valor={webhookUrl} mono />
          <Campo label="Content type" valor="application/json" mono />
          <Campo
            label="Secret"
            valor="Ver variable GITHUB_WEBHOOK_SECRET en el servidor"
          />
        </Section>

        <Section titulo="Credenciales SSH">
          <p className="font-body text-xs text-text-muted mb-3">
            Claves SSH para clonar repositorios privados. La clave privada se
            cifra antes de almacenarse.
          </p>
          <GestionCredenciales credencialesIniciales={credenciales} />
        </Section>

        <Section titulo="Notificaciones">
          <p className="font-body text-xs text-text-muted mb-3">
            Configura alertas cuando un deploy termine en éxito o error.
          </p>
          <ConfiguracionNotificaciones config={config} />
        </Section>

        <Section titulo="Sistema">
          <Campo label="Entorno" valor={env.NODE_ENV} mono />
          {env.PANEL_DOMAIN && (
            <Campo label="Dominio del panel" valor={env.PANEL_DOMAIN} mono />
          )}
          <Campo label="Socket Docker" valor={env.DOCKER_SOCKET_PATH} mono />
          <Campo label="Directorio repos" valor={env.REPOS_DIR} mono />
        </Section>
      </div>
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
    <section className="border border-border rounded-[var(--radius-md)] p-4">
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
        {titulo}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
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
            ? "bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all"
            : ""
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
