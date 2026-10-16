import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import type { DepsAplicar } from "@/lib/proxy/aplicar";
import { PUERTO_PING } from "@/lib/proxy/estatico";
import { docker } from "./client";

const log = logger.child({ module: "docker" });

const nombreRed = (clienteSlug: string) => `cliente-${clienteSlug}-network`;

async function encontrarContenedorTraefik() {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [env.TRAEFIK_CONTAINER_NAME] },
  });
  return containers.find((c) =>
    c.Names.some((n) => n === `/${env.TRAEFIK_CONTAINER_NAME}`),
  );
}

export async function estadoTraefik(): Promise<"ok" | "error"> {
  try {
    const traefik = await encontrarContenedorTraefik();
    return traefik?.State === "running" ? "ok" : "error";
  } catch {
    return "error";
  }
}

const TIMEOUT_MS = 5_000;

// Traefik fuerza permisos 600 en su fichero de certificados (propiedad de su
// propio usuario, normalmente root), así que el panel —que corre como usuario
// no-root— no puede leerlo aunque comparta el volumen. Lo leemos vía `docker
// exec` en el propio contenedor de Traefik, reutilizando el acceso al socket
// Docker que el panel ya tiene para gestionar el resto de contenedores.
//
// Dashboard, Proyectos, el detalle y el health check leen acme.json por aquí
// (vía la caché de src/lib/ssl/acme.ts) — si el exec se queda colgado (daemon
// saturado, socket sin responder), no puede bloquear el panel entero.
export async function leerFicheroTraefik(ruta: string): Promise<string> {
  return Promise.race([
    leerFicheroTraefikSinTimeout(ruta),
    new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tiempo de espera agotado leyendo ${ruta}`)),
        TIMEOUT_MS,
      ),
    ),
  ]);
}

async function leerFicheroTraefikSinTimeout(ruta: string): Promise<string> {
  const traefik = await encontrarContenedorTraefik();
  if (!traefik) {
    throw new Error(
      `Contenedor Traefik (${env.TRAEFIK_CONTAINER_NAME}) no encontrado`,
    );
  }

  const container = docker.getContainer(traefik.Id);
  const exec = await container.exec({
    Cmd: ["cat", ruta],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);
  // demuxStream never ends its targets: without this, reading them waits for
  // the timeout on every call and the certificates always come back empty.
  stream.on("end", () => {
    stdout.end();
    stderr.end();
  });
  stream.on("error", (err) => {
    stdout.destroy(err);
    stderr.destroy(err);
  });

  const [stdoutContent, stderrContent] = await Promise.all([
    leerStream(stdout),
    leerStream(stderr),
  ]);

  const { ExitCode } = await exec.inspect();
  if (ExitCode !== 0) {
    throw new Error(
      `cat ${ruta} en el contenedor Traefik falló: ${stderrContent}`,
    );
  }

  return stdoutContent;
}

async function leerStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function conectarTraefikARed(clienteSlug: string): Promise<void> {
  let traefik: Awaited<ReturnType<typeof encontrarContenedorTraefik>>;
  try {
    traefik = await encontrarContenedorTraefik();
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    log.warn({ err }, "conectarTraefikARed omitido en desarrollo");
    return;
  }
  if (!traefik) return;
  const network = docker.getNetwork(nombreRed(clienteSlug));
  try {
    await network.connect({ Container: traefik.Id });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) return;
    throw err;
  }
}

export async function desconectarTraefikDeRed(
  clienteSlug: string,
): Promise<void> {
  let traefik: Awaited<ReturnType<typeof encontrarContenedorTraefik>>;
  try {
    traefik = await encontrarContenedorTraefik();
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    log.warn({ err }, "desconectarTraefikDeRed omitido en desarrollo");
    return;
  }
  if (!traefik) return;
  const network = docker.getNetwork(nombreRed(clienteSlug));
  try {
    await network.disconnect({ Container: traefik.Id });
  } catch (err) {
    if (err instanceof Error && err.message.includes("not connected")) return;
    throw err;
  }
}

// Docker log frames (non-TTY): 8-byte header (stream, 0, 0, 0, size BE) + payload.
function textoDeFrames(buffer: Buffer): string {
  const partes: string[] = [];
  let i = 0;
  while (i + 8 <= buffer.length) {
    const tamano = buffer.readUInt32BE(i + 4);
    partes.push(buffer.subarray(i + 8, i + 8 + tamano).toString("utf-8"));
    i += 8 + tamano;
  }
  return partes.join("");
}

export function depsAplicarTraefik(): DepsAplicar {
  const estatico = `${env.TRAEFIK_STATIC_DIR}/traefik.yml`;
  const contenedor = async () => {
    const traefik = await encontrarContenedorTraefik();
    if (!traefik)
      throw new Error(
        `Contenedor Traefik (${env.TRAEFIK_CONTAINER_NAME}) no encontrado`,
      );
    return docker.getContainer(traefik.Id);
  };
  return {
    leerEstatico: async () => {
      try {
        return await readFile(estatico, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    escribirEstatico: async (contenido) => {
      await mkdir(env.TRAEFIK_STATIC_DIR, { recursive: true });
      await writeFile(estatico, contenido, "utf-8");
    },
    guardarPrevio: (contenido) =>
      writeFile(`${estatico}.prev`, contenido, "utf-8"),
    escribirTls: async (contenido) => {
      await mkdir(env.TRAEFIK_DYNAMIC_DIR, { recursive: true });
      await writeFile(
        `${env.TRAEFIK_DYNAMIC_DIR}/_proxy.yml`,
        contenido,
        "utf-8",
      );
    },
    reiniciarTraefik: async () => {
      await (await contenedor()).restart({ t: 5 });
    },
    traefikResponde: async () => {
      const res = await fetch(
        `http://${env.TRAEFIK_CONTAINER_NAME}:${PUERTO_PING}/ping`,
        { signal: AbortSignal.timeout(2_000) },
      );
      return res.ok;
    },
    ultimasLineasLog: async () => {
      const salida = (await (
        await contenedor()
      ).logs({
        stdout: true,
        stderr: true,
        tail: 30,
      })) as unknown as Buffer;
      return textoDeFrames(salida).trim();
    },
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
