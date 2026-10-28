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

  const { asegurarTraefikEstatico, limpiarOperacionProxyHuerfana } =
    await import("@/lib/proxy/operacion");
  try {
    if ((await limpiarOperacionProxyHuerfana()) > 0)
      log.warn("Aplicación del Proxy interrumpida por el reinicio, cerrada");
    if (await asegurarTraefikEstatico())
      log.warn(
        "Faltaba el traefik.yml estático: escrito con la configuración guardada",
      );
  } catch (err) {
    log.error(
      { err },
      "No se pudo preparar la configuración estática de Traefik",
    );
  }

  const { regenerarConfigTraefik } = await import("@/lib/traefik/config");
  try {
    await regenerarConfigTraefik();
  } catch (err) {
    log.error({ err }, "No se pudo regenerar la config de Traefik");
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
  // Killing the docker CLI leaves the helper container (and its tar) running.
  const { limpiarAuxiliaresHuerfanos } = await import("@/lib/backups/auxiliar");
  try {
    const auxiliares = await limpiarAuxiliaresHuerfanos();
    if (auxiliares > 0) {
      log.warn({ auxiliares }, "Contenedores auxiliares de backups eliminados");
    }
  } catch (err) {
    log.error({ err }, "No se pudieron eliminar los contenedores auxiliares");
  }
  iniciarProgramador();
}
