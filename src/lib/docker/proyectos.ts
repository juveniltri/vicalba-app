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

export async function streamProyectoLogs(
  clienteSlug: string,
  proyectoNombre: string,
  servicios: string[],
  onLine: (servicio: string, line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  await Promise.all(
    servicios.map((servicio) =>
      streamServicioLogs(clienteSlug, proyectoNombre, servicio, onLine, signal),
    ),
  );
}

async function streamServicioLogs(
  clienteSlug: string,
  proyectoNombre: string,
  servicio: string,
  onLine: (servicio: string, line: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const name = `${clienteSlug}-${proyectoNombre}-${servicio}`;
  const container = docker.getContainer(name);

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
        .forEach((line) => onLine(servicio, line));
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

export async function restartProyecto(
  clienteSlug: string,
  proyectoNombre: string,
  servicios: string[],
): Promise<void> {
  for (const servicio of servicios) {
    const name = `${clienteSlug}-${proyectoNombre}-${servicio}`;
    const container = docker.getContainer(name);
    try {
      await container.stop();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 304)
        handleDockerError(err);
    }
    try {
      await container.start();
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 304)
        handleDockerError(err);
    }
  }
}
