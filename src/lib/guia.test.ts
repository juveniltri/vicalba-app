import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));

import {
  anclaDe,
  generadorDeAnclas,
  indiceGuia,
  leerGuia,
  rutaImagen,
} from "./guia";

beforeEach(() => vi.clearAllMocks());

describe("leerGuia", () => {
  it("lee docs/guia-usuario.md", async () => {
    mockReadFile.mockResolvedValue("# Guía");
    expect(await leerGuia()).toBe("# Guía");
    expect(mockReadFile.mock.calls[0]![0]).toMatch(
      /docs[\\/]guia-usuario\.md$/,
    );
  });

  it("devuelve null si el fichero no está (imagen sin la guía)", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    expect(await leerGuia()).toBeNull();
  });
});

describe("anclaDe", () => {
  it("minúsculas, sin acentos y con guiones", () => {
    expect(anclaDe("Configuración y backups")).toBe("configuracion-y-backups");
    expect(anclaDe("  2. Dar de alta un Cliente  ")).toBe(
      "2-dar-de-alta-un-cliente",
    );
    expect(anclaDe("¿Qué es ⌘K?")).toBe("que-es-k");
  });
});

describe("generadorDeAnclas", () => {
  it("añade -2, -3 a los títulos repetidos", () => {
    const ancla = generadorDeAnclas();
    expect(ancla("Si algo falla")).toBe("si-algo-falla");
    expect(ancla("Si algo falla")).toBe("si-algo-falla-2");
    expect(ancla("Si algo falla")).toBe("si-algo-falla-3");
  });
});

describe("indiceGuia", () => {
  it("recoge los # y ## con anclas únicas e ignora ### y los bloques de código", () => {
    const md = [
      "# Parte I — Tareas",
      "## Entrar y orientarse",
      "### Si algo falla",
      "```bash",
      "## no es un título",
      "```",
      "## Desplegar",
      "## Entrar y orientarse",
      "# Anexos\r",
    ].join("\n");
    expect(indiceGuia(md)).toEqual([
      { nivel: 1, texto: "Parte I — Tareas", ancla: "parte-i-tareas" },
      { nivel: 2, texto: "Entrar y orientarse", ancla: "entrar-y-orientarse" },
      { nivel: 2, texto: "Desplegar", ancla: "desplegar" },
      {
        nivel: 2,
        texto: "Entrar y orientarse",
        ancla: "entrar-y-orientarse-2",
      },
      { nivel: 1, texto: "Anexos", ancla: "anexos" },
    ]);
  });
});

describe("rutaImagen", () => {
  it("convierte la ruta relativa del repo en la URL que sirve el Panel", () => {
    expect(rutaImagen("../public/guia/dashboard.png")).toBe(
      "/guia/dashboard.png",
    );
    expect(rutaImagen("../../public/guia/a.png")).toBe("/guia/a.png");
  });

  it("deja igual cualquier otra ruta", () => {
    expect(rutaImagen("/guia/a.png")).toBe("/guia/a.png");
    expect(rutaImagen("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });
});
