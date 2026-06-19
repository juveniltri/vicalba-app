import { PassThrough } from "stream";
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

const projectSlug = (clienteSlug: string, nombre: string) =>
  `${clienteSlug}-${nombre}`;

async function listProjectContainers(
  slug: string,
  all = false,
): Promise<
  Array<{ Id: string; Names: string[]; Labels: Record<string, string> }>
> {
  return docker.listContainers({
    all,
    filters: { label: [`com.docker.compose.project=${slug}`] },
  }) as Promise<
    Array<{ Id: string; Names: string[]; Labels: Record<string, string> }>
  >;
}

export async function iniciarProyecto(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, true);
  for (const c of containers) {
    try {
      await docker.getContainer(c.Id).start();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 304) continue;
      handleDockerError(err);
    }
  }
}

export async function detenerProyecto(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, false);
  for (const c of containers) {
    try {
      await docker.getContainer(c.Id).stop();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 304) continue;
      handleDockerError(err);
    }
  }
}

export async function restartProyecto(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, false);
  for (const c of containers) {
    try {
      await docker.getContainer(c.Id).restart();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 304)
        handleDockerError(err);
    }
  }
}

export async function streamProyectoLogs(
  clienteSlug: string,
  proyectoNombre: string,
  onLine: (servicio: string, line: string) => void,
  signal: AbortSignal,
): Promise<{ sinContenedores: boolean }> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, false);
  if (containers.length === 0) return { sinContenedores: true };
  await Promise.all(
    containers.map((c) => {
      const serviceName =
        c.Labels["com.docker.compose.service"] ?? c.Names[0] ?? c.Id;
      return streamContainerLogs(c.Id, serviceName, onLine, signal);
    }),
  );
  return { sinContenedores: false };
}

async function streamContainerLogs(
  containerId: string,
  serviceName: string,
  onLine: (servicio: string, line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const container = docker.getContainer(containerId);

  let logStream: NodeJS.ReadableStream;
  try {
    logStream = (await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      timestamps: true,
      tail: 100,
    })) as unknown as NodeJS.ReadableStream;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return;
    throw err;
  }

  return new Promise<void>((resolve, reject) => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const handleData = (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) => onLine(serviceName, line));
    };

    stdout.on("data", handleData);
    stderr.on("data", handleData);

    docker.modem.demuxStream(logStream, stdout, stderr);

    const abort = () => (logStream as PassThrough).destroy?.();
    signal.addEventListener("abort", abort, { once: true });

    const cleanup = () => signal.removeEventListener("abort", abort);

    logStream.on("end", () => {
      cleanup();
      resolve();
    });
    logStream.on("close", () => {
      cleanup();
      resolve();
    });
    logStream.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}
