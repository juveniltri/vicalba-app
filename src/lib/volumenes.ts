export function rutaHostVolumen(
  reposDir: string,
  clienteSlug: string,
  proyectoNombre: string,
  volumenNombre: string,
): string {
  return `${reposDir}/${clienteSlug}/${proyectoNombre}/volumes/${volumenNombre}`;
}
