import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));

import { leerChangelog, notasDeRelease, parsearChangelog } from "./changelog";

const md = [
  "# Changelog",
  "",
  "Texto de introducción que no es ninguna versión.",
  "",
  "## [2.1.0] - 2026-10-14",
  "",
  "Cancelar deploys y estado de Traefik.",
  "",
  "### Novedades",
  "",
  "- Cancelar un deploy en curso.",
  "- Pestaña **Logs** en el detalle,",
  "  con filtros por nivel.",
  "",
  "### Correcciones",
  "",
  "- El SSL salía «sin certificado».",
  "",
  "## [2.0 y anteriores]",
  "",
  "### Novedades",
  "",
  "- Panel inicial.",
].join("\n");

describe("parsearChangelog", () => {
  it("devuelve las versiones en el orden del fichero, la más reciente primero", () => {
    expect(parsearChangelog(md).map((v) => v.version)).toEqual([
      "2.1.0",
      "2.0 y anteriores",
    ]);
  });

  it("lee la fecha y el resumen de cada versión", () => {
    const [ultima, anterior] = parsearChangelog(md);
    expect(ultima).toMatchObject({
      fecha: "2026-10-14",
      resumen: "Cancelar deploys y estado de Traefik.",
    });
    expect(anterior).toMatchObject({ fecha: null, resumen: null });
  });

  it("agrupa las entradas por apartado y une las líneas partidas", () => {
    expect(parsearChangelog(md)[0]?.apartados).toEqual([
      {
        titulo: "Novedades",
        entradas: [
          "Cancelar un deploy en curso.",
          "Pestaña **Logs** en el detalle, con filtros por nivel.",
        ],
      },
      { titulo: "Correcciones", entradas: ["El SSL salía «sin certificado»."] },
    ]);
  });

  it("ignora un fichero sin versiones", () => {
    expect(parsearChangelog("# Changelog\n\nNada todavía.")).toEqual([]);
  });

  it("acepta finales de línea de Windows", () => {
    const [v] = parsearChangelog(md.replaceAll("\n", "\r\n"));
    expect(v?.apartados[0]?.entradas[0]).toBe("Cancelar un deploy en curso.");
  });

  it("ignora texto suelto dentro de un apartado y une el resumen sangrado", () => {
    const [v] = parsearChangelog(
      [
        "## [1.0.0]",
        "Resumen en",
        "  dos líneas.",
        "### Novedades",
        "  texto sin viñeta",
        "- Entrada.",
      ].join("\n"),
    );
    expect(v?.resumen).toBe("Resumen en dos líneas.");
    expect(v?.apartados[0]?.entradas).toEqual(["Entrada."]);
  });
});

describe("notasDeRelease", () => {
  it("escribe el resumen y cada apartado con sus entradas en una sola línea", () => {
    const [v] = parsearChangelog(md);
    expect(notasDeRelease(v!)).toBe(
      [
        "Cancelar deploys y estado de Traefik.",
        "",
        "### Novedades",
        "",
        "- Cancelar un deploy en curso.",
        "- Pestaña **Logs** en el detalle, con filtros por nivel.",
        "",
        "### Correcciones",
        "",
        "- El SSL salía «sin certificado».",
        "",
      ].join("\n"),
    );
  });

  it("empieza por el primer apartado si la versión no tiene resumen", () => {
    const [, anterior] = parsearChangelog(md);
    expect(notasDeRelease(anterior!)).toBe(
      "### Novedades\n\n- Panel inicial.\n",
    );
  });
});

describe("leerChangelog", () => {
  it("lee CHANGELOG.md de la raíz de la aplicación", async () => {
    mockReadFile.mockResolvedValue(
      "## [2.1.0] - 2026-10-14\n### Novedades\n- Algo.",
    );
    const versiones = await leerChangelog();
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(process.cwd(), "CHANGELOG.md"),
      "utf-8",
    );
    expect(versiones[0]?.version).toBe("2.1.0");
  });

  it("devuelve una lista vacía si el fichero no está", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    expect(await leerChangelog()).toEqual([]);
  });
});
