import { captureRequestError } from "@sentry/nextjs";

// Next calls this for unhandled errors in pages, route handlers and server
// actions; it is a no-op until initSentry() has run with a DSN.
export const onRequestError = captureRequestError;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/logger");
  const { initSentry } = await import("@/lib/sentry");
  const { limpiarDeploysHuerfanos } = await import("@/lib/docker/deploys");
  const log = logger.child({ module: "arranque" });

  if (!initSentry() && process.env.NODE_ENV === "production") {
    log.warn("SENTRY_DSN no configurado: los errores no se envían a Sentry");
  }

  // Deploys only live in this process: any left en_curso died with the previous one.
  try {
    const proyectos = await limpiarDeploysHuerfanos(
      "Interrumpido por reinicio del panel",
    );
    if (proyectos > 0) {
      log.warn({ proyectos }, "Deploys interrumpidos por el reinicio cerrados");
    }
  } catch (err) {
    log.error({ err }, "No se pudieron cerrar los deploys interrumpidos");
  }

  const { limpiarBackupsHuerfanos } = await import("@/lib/backups/operacion");
  const { iniciarProgramador } = await import("@/lib/backups/programador");
  try {
    const huerfanos = await limpiarBackupsHuerfanos(
      "Interrumpido por reinicio del panel",
    );
    if (huerfanos > 0) {
      log.warn({ huerfanos }, "Copias de seguridad interrumpidas cerradas");
    }
  } catch (err) {
    log.error({ err }, "No se pudieron cerrar las copias interrumpidas");
  }
  iniciarProgramador();
}
