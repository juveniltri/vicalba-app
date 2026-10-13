import { docker } from "./client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "docker" });

const nombreRed = (clienteSlug: string) => `cliente-${clienteSlug}-network`;

export async function asegurarRedCliente(clienteSlug: string): Promise<void> {
  try {
    const nombre = nombreRed(clienteSlug);
    const redes = await docker.listNetworks({ filters: { name: [nombre] } });
    const existe = redes.some((r) => r.Name === nombre);
    if (!existe) {
      await docker.createNetwork({ Name: nombre, Driver: "bridge" });
    }
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    log.warn({ err }, "asegurarRedCliente omitido en desarrollo");
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
    if (process.env.NODE_ENV === "production") throw err;
    log.warn({ err }, "eliminarRedCliente omitido en desarrollo");
  }
}
