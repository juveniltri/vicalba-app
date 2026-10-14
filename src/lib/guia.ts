import { readFile } from "node:fs/promises";
import path from "node:path";

export type EntradaIndice = { nivel: 1 | 2; texto: string; ancla: string };

export async function leerGuia(): Promise<string | null> {
  try {
    return await readFile(
      path.join(process.cwd(), "docs", "guia-usuario.md"),
      "utf-8",
    );
  } catch {
    return null;
  }
}

export function anclaDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The index and the rendered headings must produce the same anchors in the
// same order, so both go through one of these.
export function generadorDeAnclas(): (texto: string) => string {
  const vistas = new Map<string, number>();
  return (texto) => {
    const base = anclaDe(texto);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

export function indiceGuia(md: string): EntradaIndice[] {
  const ancla = generadorDeAnclas();
  const indice: EntradaIndice[] = [];
  let enCodigo = false;
  for (const linea of md.split("\n")) {
    if (linea.startsWith("```")) {
      enCodigo = !enCodigo;
      continue;
    }
    const m = enCodigo ? null : /^(#{1,2}) (.+?)\s*$/.exec(linea);
    if (!m) continue;
    const texto = m[2]!;
    indice.push({
      nivel: m[1]!.length === 1 ? 1 : 2,
      texto,
      ancla: ancla(texto),
    });
  }
  return indice;
}

export function rutaImagen(src: string): string {
  return src.replace(/^(\.\.\/)+public\//, "/");
}
