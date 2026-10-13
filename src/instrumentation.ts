export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/logger");
  const { limpiarDeploysHuerfanos } = await import("@/lib/docker/deploys");
  const log = logger.child({ module: "arranque" });

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
}
