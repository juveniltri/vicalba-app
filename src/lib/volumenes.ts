import path from "node:path";

export function rutaHostVolumen(
  reposDir: string,
  clienteSlug: string,
  proyectoNombre: string,
  volumenNombre: string,
): string {
  return `${reposDir}/${clienteSlug}/${proyectoNombre}/volumes/${volumenNombre}`;
}

// Blocks path traversal out of the volume. The base also goes through
// path.resolve: comparing the raw POSIX base against a resolved path rejected
// every request on Windows. Destructive actions pass permitirRaiz: false so
// "." or "x/.." cannot target the whole volume.
export function resolverRutaSegura(
  base: string,
  relativa: string,
  { permitirRaiz = true }: { permitirRaiz?: boolean } = {},
): string | null {
  const raiz = path.resolve(base);
  const ruta = path.resolve(raiz, relativa);
  if (ruta === raiz) return permitirRaiz ? ruta : null;
  return ruta.startsWith(raiz + path.sep) ? ruta : null;
}
