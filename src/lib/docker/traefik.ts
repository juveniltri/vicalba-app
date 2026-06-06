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

export async function conectarTraefikARed(clienteSlug: string): Promise<void> {
  const traefik = await encontrarContenedorTraefik();
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
  const traefik = await encontrarContenedorTraefik();
  if (!traefik) return;
  const network = docker.getNetwork(nombreRed(clienteSlug));
  try {
    await network.disconnect({ Container: traefik.Id });
  } catch {
    // absorb — no estaba conectado
  }
}
