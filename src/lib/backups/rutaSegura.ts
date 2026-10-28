import { lstat } from "fs/promises";
import path from "path";

export type EstadoRuta = "ok" | "enlace" | "no_carpeta" | "no_existe";

// Comparing the host path as text is not enough: a repo can version
// `data -> /etc` and Docker follows the link when mounting, so every
// component is checked with lstat on the host root mounted in the Panel.
export async function comprobarRuta(
  origen: string,
  raiz = "/hostroot",
): Promise<EstadoRuta> {
  if (!path.posix.isAbsolute(origen)) return "no_existe";
  const partes = path.posix.normalize(origen).split("/").filter(Boolean);
  let actual = raiz;
  for (const [i, parte] of partes.entries()) {
    actual = path.join(actual, parte);
    const info = await lstat(actual).catch(() => null);
    if (!info) return "no_existe";
    if (info.isSymbolicLink()) return "enlace";
    if (!info.isDirectory())
      return i === partes.length - 1 ? "no_carpeta" : "no_existe";
  }
  return "ok";
}
