import { docker } from "./client";

const nombreRed = (clienteSlug: string) => `cliente-${clienteSlug}-network`;

export async function asegurarRedCliente(clienteSlug: string): Promise<void> {
  const nombre = nombreRed(clienteSlug);
  const redes = await docker.listNetworks({ filters: { name: [nombre] } });
  const existe = redes.some((r) => r.Name === nombre);
  if (!existe) {
    await docker.createNetwork({ Name: nombre, Driver: "bridge" });
  }
}

export async function eliminarRedCliente(clienteSlug: string): Promise<void> {
  const nombre = nombreRed(clienteSlug);
  const redes = await docker.listNetworks({ filters: { name: [nombre] } });
  const red = redes.find((r) => r.Name === nombre);
  if (red) {
    await docker.getNetwork(red.Id).remove();
  }
}
