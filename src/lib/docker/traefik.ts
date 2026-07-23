import { PassThrough } from "node:stream";
import { env } from "@/env";
import { docker } from "./client";

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

const TIMEOUT_MS = 5_000;

// Traefik fuerza permisos 600 en su fichero de certificados (propiedad de su
// propio usuario, normalmente root), así que el panel —que corre como usuario
// no-root— no puede leerlo aunque comparta el volumen. Lo leemos vía `docker
// exec` en el propio contenedor de Traefik, reutilizando el acceso al socket
// Docker que el panel ya tiene para gestionar el resto de contenedores.
//
// leerEstadoSSL se llama una vez POR PROYECTO CON DOMINIO en el listado del
// dashboard (justo donde redirige el login) — si el exec se queda colgado
// (daemon saturado, socket sin responder), no puede bloquear el panel entero.
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
    console.warn(
      `[docker] Skipping conectarTraefikARed in dev: ${(err as Error).message}`,
    );
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
    console.warn(
      `[docker] Skipping desconectarTraefikDeRed in dev: ${(err as Error).message}`,
    );
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
