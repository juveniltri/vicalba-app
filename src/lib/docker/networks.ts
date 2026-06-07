import { env } from "@/env";
import { docker } from "./client";

const nombreRed = (clienteSlug: string) => `cliente-${clienteSlug}-network`;

function warnDev(fn: string, err: unknown) {
  console.warn(`[docker] Skipping ${fn} in dev: ${(err as Error).message}`);
}

export async function asegurarRedCliente(clienteSlug: string): Promise<void> {
  try {
    const nombre = nombreRed(clienteSlug);
    const redes = await docker.listNetworks({ filters: { name: [nombre] } });
    const existe = redes.some((r) => r.Name === nombre);
    if (!existe) {
      await docker.createNetwork({ Name: nombre, Driver: "bridge" });
    }
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    warnDev("asegurarRedCliente", err);
  }
}

export async function eliminarRedCliente(clienteSlug: string): Promise<void> {
  try {
    const nombre = nombreRed(clienteSlug);
    const redes = await docker.listNetworks({ filters: { name: [nombre] } });
    const red = redes.find((r) => r.Name === nombre);
    if (red) {
      await docker.getNetwork(red.Id).remove();
    }
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    warnDev("eliminarRedCliente", err);
  }
}
