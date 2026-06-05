import { docker } from "./client";

export class DockerError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "DockerError";
  }
}

function handleDockerError(err: unknown): never {
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 404) throw new DockerError("NOT_FOUND", "Container not found");
  throw new DockerError("UNKNOWN", String(err));
}

export async function detenerProyecto(
  clienteSlug: string,
  proyectoNombre: string,
  servicios: string[],
): Promise<void> {
  for (const servicio of servicios) {
    const name = `${clienteSlug}-${proyectoNombre}-${servicio}`;
    try {
      await docker.getContainer(name).stop();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 304) continue;
      handleDockerError(err);
    }
  }
}

export async function iniciarProyecto(
  clienteSlug: string,
  proyectoNombre: string,
  servicios: string[],
): Promise<void> {
  for (const servicio of servicios) {
    const name = `${clienteSlug}-${proyectoNombre}-${servicio}`;
    try {
      await docker.getContainer(name).start();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 304) continue;
      handleDockerError(err);
    }
  }
}
