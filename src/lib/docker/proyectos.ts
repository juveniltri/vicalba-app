import { PassThrough } from "stream";
import type { EstadoServicio } from "@/lib/mock-data";
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

type ContenedorProyecto = {
  Id: string;
  Names: string[];
  Labels: Record<string, string>;
  State: string;
  Status: string;
};

async function listProjectContainers(
  slug: string,
  all = false,
  servicio?: string,
): Promise<ContenedorProyecto[]> {
  const label = [`com.docker.compose.project=${slug}`];
  if (servicio) label.push(`com.docker.compose.service=${servicio}`);
  return docker.listContainers({ all, filters: { label } }) as Promise<
    ContenedorProyecto[]
  >;
}

export type ServicioProyecto = {
  servicio: string;
  estado: EstadoServicio;
  detalle: string;
};

const GRAVEDAD: Record<EstadoServicio, number> = {
  running: 0,
  stopped: 1,
  deploying: 2,
  error: 3,
};

function estadoDeContenedor(c: ContenedorProyecto): EstadoServicio {
  if (c.State === "dead" || c.Status.includes("(unhealthy)")) return "error";
  if (c.State === "restarting") return "deploying";
  return c.State === "running" ? "running" : "stopped";
}

export async function listarServicios(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<ServicioProyecto[]> {
  const contenedores = await listProjectContainers(
    projectSlug(clienteSlug, proyectoNombre),
    true,
  );
  const porServicio = new Map<string, ServicioProyecto>();
  for (const c of contenedores) {
    const servicio =
      c.Labels["com.docker.compose.service"] ??
      c.Names[0]?.replace(/^\//, "") ??
      c.Id;
    const estado = estadoDeContenedor(c);
    const previo = porServicio.get(servicio);
    if (!previo || GRAVEDAD[estado] > GRAVEDAD[previo.estado])
      porServicio.set(servicio, { servicio, estado, detalle: c.Status });
  }
  return [...porServicio.values()].sort((a, b) =>
    a.servicio.localeCompare(b.servicio),
  );
}

export async function estadoContenedores(
  clienteSlug: string,
  proyectoNombre: string,
): Promise<"running" | "stopped"> {
  const corriendo = await listProjectContainers(
    projectSlug(clienteSlug, proyectoNombre),
  );
  return corriendo.length > 0 ? "running" : "stopped";
}

export async function iniciarProyecto(
  clienteSlug: string,
  proyectoNombre: string,
  servicio?: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, true, servicio);
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
  servicio?: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, false, servicio);
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
  servicio?: string,
): Promise<void> {
  const slug = projectSlug(clienteSlug, proyectoNombre);
  const containers = await listProjectContainers(slug, false, servicio);
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
