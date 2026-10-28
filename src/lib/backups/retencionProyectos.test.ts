import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SnapshotProyecto } from "./restic";

const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  detectar: vi.fn(),
  listar: vi.fn(),
  olvidar: vi.fn(),
  podar: vi.fn(),
  config: vi.fn(),
  tomar: vi.fn(),
  soltar: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: m.warn, error: m.error }) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { proyecto: { findMany: m.findMany } },
}));
vi.mock("./deteccion", () => ({ detectarProyecto: m.detectar }));
vi.mock("./restic", () => ({
  listarSnapshotsProyectos: m.listar,
  olvidar: m.olvidar,
  podar: m.podar,
}));
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.config,
  conRestic: (
    _c: unknown,
    _s: unknown,
    fn: (r: { env: object; args: string[] }) => Promise<void>,
  ) => fn({ env: {}, args: [] }),
}));
vi.mock("./operacion", () => ({
  tomarOperacion: m.tomar,
  soltarOperacion: m.soltar,
}));

import { hashClave } from "./comandos";
import {
  aplicarRetencionProyectos,
  iniciarPurgaProyecto,
  planRetencion,
} from "./retencionProyectos";

const AHORA = new Date("2026-10-28T12:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

function snap(p: Partial<SnapshotProyecto>): SnapshotProyecto {
  return {
    id: "s",
    fecha: dias(1),
    bytes: 1,
    ruta: "x",
    proyectoId: "p1",
    hashElemento: "h1",
    backupId: "c",
    origen: "programado",
    ...p,
  };
}

describe("planRetencion", () => {
  it("emite 7+4 por elemento y 30d por cada otro origen presente", () => {
    const plan = planRetencion(
      [
        snap({ id: "a" }),
        snap({ id: "b", origen: "manual" }),
        snap({ id: "c", hashElemento: "h2" }),
      ],
      {
        proyectosExistentes: new Set(["p1"]),
        detectados: new Map([["p1", new Set(["h1", "h2"])]]),
        ahora: AHORA,
      },
    );
    expect(plan.purgas).toEqual([]);
    expect(plan.olvidos).toContainEqual({
      etiquetas: ["p:p1", "e:h1", "o:programado"],
      politica: "7+4",
    });
    expect(plan.olvidos).toContainEqual({
      etiquetas: ["p:p1", "e:h1", "o:manual"],
      politica: "30d",
    });
    expect(plan.olvidos).toContainEqual({
      etiquetas: ["p:p1", "e:h2", "o:programado"],
      politica: "7+4",
    });
    expect(plan.olvidos).toHaveLength(3);
  });

  it("purga un Proyecto inexistente cuyo último snapshot tiene más de 30 días", () => {
    const ctx = {
      proyectosExistentes: new Set<string>(),
      detectados: new Map(),
      ahora: AHORA,
    };
    const viejo = planRetencion(
      [
        snap({ id: "a", fecha: dias(40) }),
        snap({ id: "b", fecha: dias(31), hashElemento: "h2" }),
      ],
      ctx,
    );
    expect(viejo.purgas.sort()).toEqual(["a", "b"]);
    expect(viejo.olvidos).toEqual([]);
    const reciente = planRetencion(
      [snap({ id: "a", fecha: dias(40) }), snap({ id: "b", fecha: dias(29) })],
      ctx,
    );
    expect(reciente.purgas).toEqual([]);
  });

  it("purga el elemento no detectado con más de 30 días y detección válida", () => {
    const plan = planRetencion(
      [
        snap({ id: "a", fecha: dias(35) }),
        snap({ id: "b", fecha: dias(5), hashElemento: "h2" }),
        snap({ id: "c", fecha: dias(35), hashElemento: "h3" }),
        snap({ id: "d", fecha: dias(2), hashElemento: "h3" }),
      ],
      {
        proyectosExistentes: new Set(["p1"]),
        detectados: new Map([["p1", new Set<string>()]]),
        ahora: AHORA,
      },
    );
    expect(plan.purgas).toEqual(["a"]);
  });

  it("no purga nada si la detección no es válida o falta", () => {
    const snaps = [snap({ id: "a", fecha: dias(90) })];
    for (const detectados of [
      new Map([["p1", null]]),
      new Map<string, Set<string> | null>(),
    ]) {
      const plan = planRetencion(snaps, {
        proyectosExistentes: new Set(["p1"]),
        detectados,
        ahora: AHORA,
      });
      expect(plan.purgas).toEqual([]);
      expect(plan.olvidos).toHaveLength(1);
    }
  });
});

const r = { env: {}, args: [] };

beforeEach(() => {
  vi.clearAllMocks();
  m.olvidar.mockResolvedValue(undefined);
  m.podar.mockResolvedValue(undefined);
});

describe("aplicarRetencionProyectos", () => {
  it("planifica con lo detectado y ejecuta sin podar", async () => {
    m.listar.mockResolvedValue([
      snap({ id: "a", hashElemento: hashClave("datos:x") }),
      snap({ id: "z", proyectoId: "gone", fecha: dias(60) }),
      snap({ id: "y", proyectoId: "p2", fecha: dias(60) }),
    ]);
    m.findMany.mockResolvedValue([
      { id: "p1", nombre: "web", cliente: { slug: "uno" } },
      { id: "p2", nombre: "api", cliente: { slug: "uno" } },
    ]);
    m.detectar.mockImplementation(async (_c: string, n: string) =>
      n === "web"
        ? { valida: true, elementos: [{ clave: "datos:x" }], noCopiados: [] }
        : { valida: false, elementos: [], noCopiados: [] },
    );
    await aplicarRetencionProyectos(r);
    expect(m.detectar).toHaveBeenCalledWith("uno", "web");
    expect(m.olvidar).toHaveBeenCalledWith(r, {
      etiquetas: ["p:p1", `e:${hashClave("datos:x")}`, "o:programado"],
      politica: "7+4",
    });
    expect(m.olvidar).toHaveBeenCalledWith(r, {
      etiquetas: [],
      politica: "todo",
      ids: ["z"],
    });
    expect(m.podar).not.toHaveBeenCalled();
  });

  it("no purga elementos si la detección trae noCopiados", async () => {
    m.listar.mockResolvedValue([snap({ id: "a", fecha: dias(90) })]);
    m.findMany.mockResolvedValue([
      { id: "p1", nombre: "web", cliente: { slug: "uno" } },
    ]);
    m.detectar.mockResolvedValue({
      valida: true,
      elementos: [],
      noCopiados: [{ origen: "/data", motivo: "enlace simbólico" }],
    });
    await aplicarRetencionProyectos(r);
    expect(m.olvidar).not.toHaveBeenCalledWith(
      r,
      expect.objectContaining({ politica: "todo" }),
    );
    expect(m.olvidar).toHaveBeenCalledWith(
      r,
      expect.objectContaining({ politica: "7+4" }),
    );
  });

  it("frena la purga de Proyectos eliminados si la BD no tiene Proyectos", async () => {
    m.listar.mockResolvedValue([
      snap({ id: "a", fecha: dias(90), proyectoId: "gone" }),
    ]);
    m.findMany.mockResolvedValue([]);
    await aplicarRetencionProyectos(r);
    expect(m.warn).toHaveBeenCalledTimes(1);
    expect(m.olvidar).not.toHaveBeenCalledWith(
      r,
      expect.objectContaining({ politica: "todo" }),
    );
    expect(m.olvidar).toHaveBeenCalledWith(
      r,
      expect.objectContaining({ politica: "7+4" }),
    );
  });

  it("no llama a olvidar 'todo' si no hay purgas", async () => {
    m.listar.mockResolvedValue([]);
    m.findMany.mockResolvedValue([]);
    await aplicarRetencionProyectos(r);
    expect(m.olvidar).not.toHaveBeenCalled();
  });
});

describe("iniciarPurgaProyecto", () => {
  it("toma el bloqueo de forma síncrona y lanza si está ocupado", async () => {
    m.tomar.mockImplementation(() => {
      throw new Error("ocupado");
    });
    await expect(iniciarPurgaProyecto("p1")).rejects.toThrow("ocupado");
    expect(m.listar).not.toHaveBeenCalled();
  });

  it("olvida los snapshots del Proyecto, poda y suelta el bloqueo", async () => {
    const controlador = new AbortController();
    m.tomar.mockReturnValue(controlador);
    m.listar.mockResolvedValue([snap({ id: "a" }), snap({ id: "b" })]);
    m.config.mockResolvedValue({});
    await iniciarPurgaProyecto("p1");
    await vi.waitFor(() => expect(m.soltar).toHaveBeenCalled());
    expect(m.olvidar).toHaveBeenCalledWith(expect.anything(), {
      etiquetas: [],
      politica: "todo",
      ids: ["a", "b"],
    });
    expect(m.podar).toHaveBeenCalled();
  });

  it("registra el fallo y suelta el bloqueo", async () => {
    m.tomar.mockReturnValue(new AbortController());
    m.config.mockRejectedValue(new Error("sin destino"));
    await iniciarPurgaProyecto("p1");
    await vi.waitFor(() => expect(m.soltar).toHaveBeenCalled());
    expect(m.error).toHaveBeenCalled();
    expect(m.podar).not.toHaveBeenCalled();
  });
});
