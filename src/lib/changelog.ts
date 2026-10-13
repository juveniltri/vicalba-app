import { readFile } from "node:fs/promises";
import path from "node:path";

export type Apartado = { titulo: string; entradas: string[] };

export type Version = {
  version: string;
  fecha: string | null;
  resumen: string | null;
  apartados: Apartado[];
};

const CABECERA_VERSION = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?/;

// Reads the "Keep a Changelog" subset the project writes: `## [x] - fecha`,
// an optional summary paragraph, `### Apartado` and `- entrada` bullets whose
// wrapped lines are indented.
export function parsearChangelog(md: string): Version[] {
  const versiones: Version[] = [];
  let version: Version | null = null;
  let apartado: Apartado | null = null;

  for (const linea of md.split(/\r?\n/)) {
    const cabecera = CABECERA_VERSION.exec(linea);
    if (cabecera) {
      version = {
        version: cabecera[1]!,
        fecha: cabecera[2] ?? null,
        resumen: null,
        apartados: [],
      };
      versiones.push(version);
      apartado = null;
      continue;
    }
    if (!version) continue;

    if (linea.startsWith("### ")) {
      apartado = { titulo: linea.slice(4).trim(), entradas: [] };
      version.apartados.push(apartado);
    } else if (linea.startsWith("- ") && apartado) {
      apartado.entradas.push(linea.slice(2).trim());
    } else if (/^\s+\S/.test(linea) && apartado?.entradas.length) {
      const ultima = apartado.entradas.length - 1;
      apartado.entradas[ultima] += ` ${linea.trim()}`;
    } else if (linea.trim() && !apartado) {
      version.resumen = version.resumen
        ? `${version.resumen} ${linea.trim()}`
        : linea.trim();
    }
  }
  return versiones;
}

// CHANGELOG.md is copied into the panel image (Dockerfile + .dockerignore
// exception); if it is missing the panel just shows no history.
export async function leerChangelog(): Promise<Version[]> {
  try {
    const md = await readFile(
      path.join(process.cwd(), "CHANGELOG.md"),
      "utf-8",
    );
    return parsearChangelog(md);
  } catch {
    return [];
  }
}
