import { hashClave, IMAGEN_AUXILIAR } from "./comandos";
import { ejecutar, ErrorProceso } from "./procesos";

export { IMAGEN_AUXILIAR };

const PREFIJO = "vicalba-backup-";

export function nombreAuxiliar(backupId: string, clave: string): string {
  return `${PREFIJO}${backupId}-${hashClave(clave)}`;
}

// Killing the docker CLI does not stop the container it started, so aborted
// copies remove the auxiliary container by name.
export async function eliminarAuxiliar(nombre: string): Promise<void> {
  try {
    await ejecutar("docker", ["rm", "-f", nombre], {});
  } catch (err) {
    const texto =
      err instanceof ErrorProceso ? `${err.message}\n${err.salida}` : "";
    if (!/No such container/i.test(texto)) throw err;
  }
}

export async function limpiarAuxiliaresHuerfanos(): Promise<number> {
  const salida = await ejecutar(
    "docker",
    // Docker's name filter is an unanchored regex.
    ["ps", "-a", "--filter", `name=^${PREFIJO}`, "-q"],
    {},
  );
  const ids = salida.split(/\s+/).filter(Boolean);
  if (ids.length === 0) return 0;
  await ejecutar("docker", ["rm", "-f", ...ids], {});
  return ids.length;
}
