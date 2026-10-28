import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Proceso } from "./procesos";
import type { Restic } from "./restic";
import type { Deteccion, ElementoBd, ElementoDatos } from "./deteccion";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  ejecutar: vi.fn(),
  snapshot: vi.fn(),
  eliminarAuxiliar: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: m.warn, error: m.error }) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { elementoCopia: { create: m.create, update: m.update } },
}));
vi.mock("./procesos", () => ({ ejecutar: m.ejecutar }));
vi.mock("./restic", () => ({ crearSnapshotStdin: m.snapshot }));
vi.mock("./auxiliar", () => ({
  nombreAuxiliar: (backupId: string, clave: string) =>
    `aux-${backupId}-${clave}`,
  eliminarAuxiliar: m.eliminarAuxiliar,
}));

import { copiarProyecto, LIMITE_BD_MS, LIMITE_DATOS_MS } from "./copiaProyecto";

const DB: ElementoBd = {
  tipo: "bd",
  clave: "bd:db",
  servicio: "db",
  motor: "postgres",
  contenedorId: "c-db",
  enMarcha: true,
};
const MEDIA: ElementoDatos = {
  tipo: "datos",
  clave: "datos:./data/media",
  origen: "/r/cli/crm/data/media",
  montaje: "bind",
  restaurable: true,
};
const UPLOADS: ElementoDatos = {
  tipo: "datos",
  clave: "volumen:cli-crm_uploads",
  origen: "cli-crm_uploads",
  montaje: "volume",
  restaurable: true,
};
const MARIA: ElementoBd = {
  tipo: "bd",
  clave: "bd:maria",
  servicio: "maria",
  motor: "mysql",
  contenedorId: "c-maria",
  enMarcha: true,
};

function deteccion(...elementos: Deteccion["elementos"]): Deteccion {
  return { valida: true, elementos, noCopiados: [] };
}

const ciclo = new AbortController();
const restic: Restic = { env: { RESTIC_PASSWORD: "x" }, args: ["-r", "repo"] };

function params(over: Partial<Parameters<typeof copiarProyecto>[0]> = {}) {
  return {
    proyecto: { id: "p1", nombre: "crm", clienteSlug: "cli" },
    backupId: "b1",
    origen: "programado" as const,
    restic: { ...restic, signal: ciclo.signal },
    deteccion: deteccion(DB, MEDIA, UPLOADS),
    incluidos: () => true,
    ...over,
  };
}

let n = 0;
// Resolves like restic, or never (until its signal aborts) when `colgar` matches.
function snapshotSimulado(colgar?: (p: Proceso) => boolean) {
  return (r: Restic, p: { proceso: Proceso }) => {
    if (colgar?.(p.proceso)) {
      return new Promise((_, reject) => {
        r.signal?.addEventListener("abort", () => {
          const e = new Error("restic cancelado");
          e.name = "AbortError";
          reject(e);
        });
      });
    }
    n += 1;
    return Promise.resolve({ snapshotId: `s${n}`, bytesAnadidos: 10 });
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  n = 0;
  m.create.mockImplementation(({ data }: { data: { clave: string } }) =>
    Promise.resolve({ id: `fila-${data.clave}` }),
  );
  m.update.mockResolvedValue({});
  m.ejecutar.mockResolvedValue("crm\npostgres\n");
  m.snapshot.mockImplementation(snapshotSimulado());
  m.eliminarAuxiliar.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("copiarProyecto", () => {
  it("copia el CRM: bases y roles de Postgres y un snapshot por datos", async () => {
    const r = await copiarProyecto(params());

    expect(r).toEqual([
      { clave: "bd:db", ok: true },
      { clave: "datos:./data/media", ok: true },
      { clave: "volumen:cli-crm_uploads", ok: true },
    ]);
    expect(m.ejecutar).toHaveBeenCalledTimes(1);
    const [comando, args] = m.ejecutar.mock.calls[0] as [string, string[]];
    expect(comando).toBe("docker");
    expect(args.slice(0, 2)).toEqual(["exec", "c-db"]);
    expect(args.at(-1)).toContain("select datname from pg_database");

    const llamadas = m.snapshot.mock.calls.map(
      ([, p]) => p as { proceso: Proceso; nombre: string; etiquetas: string[] },
    );
    expect(llamadas.map((p) => p.nombre)).toEqual([
      "/bd/db/crm.sql",
      "/bd/db/postgres.sql",
      "/bd/db/_roles.sql",
      `/datos/${encodeURIComponent("datos:./data/media")}.tar`,
      `/datos/${encodeURIComponent("volumen:cli-crm_uploads")}.tar`,
    ]);
    expect(llamadas[0].proceso.args.at(-1)).toContain("pg_dump");
    expect(llamadas[0].proceso.args.at(-1)).toContain("'crm'");
    expect(llamadas[2].proceso.args.at(-1)).toContain("pg_dumpall");
    expect(llamadas[3].proceso.args).toEqual(
      expect.arrayContaining([
        "--name",
        "aux-b1-datos:./data/media",
        "/r/cli/crm/data/media:/datos:ro",
      ]),
    );
    expect(llamadas[0].etiquetas).toEqual([
      "proyecto",
      "p:p1",
      expect.stringMatching(/^e:[0-9a-f]{12}$/),
      "c:b1",
      "o:programado",
    ]);
    // All parts of one element share its e: tag.
    expect(new Set(llamadas.slice(0, 3).map((p) => p.etiquetas[2])).size).toBe(
      1,
    );
    expect(llamadas[3].etiquetas[2]).not.toBe(llamadas[0].etiquetas[2]);

    expect(m.create).toHaveBeenCalledTimes(3);
    expect(m.create).toHaveBeenCalledWith({
      data: { backupId: "b1", clave: "bd:db" },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "fila-bd:db" },
      data: {
        resultado: "exito",
        snapshotIds: ["s1", "s2", "s3"],
        bytesAnadidos: BigInt(30),
      },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "fila-datos:./data/media" },
      data: { resultado: "exito", snapshotIds: ["s4"], bytesAnadidos: 10n },
    });
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith(
      "aux-b1-datos:./data/media",
    );
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith(
      "aux-b1-volumen:cli-crm_uploads",
    );
  });

  it("MySQL es un único snapshot", async () => {
    await copiarProyecto(params({ deteccion: deteccion(MARIA) }));

    expect(m.ejecutar).not.toHaveBeenCalled();
    expect(m.snapshot).toHaveBeenCalledTimes(1);
    expect(m.snapshot.mock.calls[0][1]).toMatchObject({
      nombre: "/bd/maria/todo.sql",
    });
  });

  it("no copia ni registra los elementos desmarcados", async () => {
    const r = await copiarProyecto(
      params({ incluidos: (c) => c !== "datos:./data/media" }),
    );

    expect(r.map((e) => e.clave)).toEqual(["bd:db", "volumen:cli-crm_uploads"]);
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.create).not.toHaveBeenCalledWith({
      data: { backupId: "b1", clave: "datos:./data/media" },
    });
  });

  it("soloClaves es el único filtro: copia lo que se va a sustituir aunque esté desmarcado", async () => {
    const r = await copiarProyecto(
      params({
        incluidos: () => false,
        soloClaves: ["datos:./data/media"],
        origen: "antes_de_restaurar",
      }),
    );

    expect(r).toEqual([{ clave: "datos:./data/media", ok: true }]);
    expect(m.snapshot).toHaveBeenCalledTimes(1);
    expect(m.snapshot.mock.calls[0][1]).toMatchObject({
      etiquetas: expect.arrayContaining(["o:antes_de_restaurar"]),
    });
  });

  it("un elemento que falla no para el resto", async () => {
    m.snapshot.mockImplementation((r: Restic, p: { nombre: string }) =>
      p.nombre.startsWith("/datos/datos")
        ? Promise.reject(new Error("tar terminó con código 2"))
        : snapshotSimulado()(r, p as never),
    );

    const r = await copiarProyecto(params());

    expect(r).toEqual([
      { clave: "bd:db", ok: true },
      {
        clave: "datos:./data/media",
        ok: false,
        error: "tar terminó con código 2",
      },
      { clave: "volumen:cli-crm_uploads", ok: true },
    ]);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "fila-datos:./data/media" },
      data: {
        resultado: "error",
        error: "tar terminó con código 2",
        snapshotIds: [],
        bytesAnadidos: 0n,
      },
    });
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith(
      "aux-b1-datos:./data/media",
    );
  });

  it("conserva los snapshots ya hechos de una BD que falla a mitad", async () => {
    m.snapshot.mockImplementation((r: Restic, p: { nombre: string }) =>
      p.nombre === "/bd/db/postgres.sql"
        ? Promise.reject(new Error("pg_dump terminó con código 1"))
        : snapshotSimulado()(r, p as never),
    );

    const r = await copiarProyecto(params({ deteccion: deteccion(DB) }));

    expect(r).toEqual([
      { clave: "bd:db", ok: false, error: "pg_dump terminó con código 1" },
    ]);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "fila-bd:db" },
      data: {
        resultado: "error",
        error: "pg_dump terminó con código 1",
        snapshotIds: ["s1"],
        bytesAnadidos: 10n,
      },
    });
  });

  it("una BD parada falla sin intentarlo", async () => {
    const r = await copiarProyecto(
      params({ deteccion: deteccion({ ...DB, enMarcha: false }) }),
    );

    expect(r).toEqual([
      { clave: "bd:db", ok: false, error: "El contenedor db está parado" },
    ]);
    expect(m.ejecutar).not.toHaveBeenCalled();
    expect(m.snapshot).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "fila-bd:db" },
      data: {
        resultado: "error",
        error: "El contenedor db está parado",
        snapshotIds: [],
        bytesAnadidos: 0n,
      },
    });
  });

  it("una BD que no termina se corta a los 60 minutos y sigue con el resto", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    m.snapshot.mockImplementation(
      snapshotSimulado((p) => p.args.at(-1)!.includes("pg_dump ")),
    );

    const promesa = copiarProyecto(params({ deteccion: deteccion(DB, MEDIA) }));
    await vi.advanceTimersByTimeAsync(LIMITE_BD_MS - 1);
    expect(m.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const r = await promesa;

    expect(LIMITE_BD_MS).toBe(60 * 60 * 1000);
    expect(r).toEqual([
      {
        clave: "bd:db",
        ok: false,
        error: "Cancelado: bd:db superó 60 minutos",
      },
      { clave: "datos:./data/media", ok: true },
    ]);
  });

  it("los datos se cortan a las 12 horas y el auxiliar se elimina", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    m.snapshot.mockImplementation(snapshotSimulado(() => true));

    const promesa = copiarProyecto(params({ deteccion: deteccion(MEDIA) }));
    await vi.advanceTimersByTimeAsync(LIMITE_BD_MS);
    expect(m.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIMITE_DATOS_MS - LIMITE_BD_MS);
    const r = await promesa;

    expect(LIMITE_DATOS_MS).toBe(12 * 60 * 60 * 1000);
    expect(r).toEqual([
      {
        clave: "datos:./data/media",
        ok: false,
        error: "Cancelado: datos:./data/media superó 12 horas",
      },
    ]);
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith(
      "aux-b1-datos:./data/media",
    );
  });

  it("al cancelar el ciclo el error es su motivo y el auxiliar se elimina", async () => {
    const control = new AbortController();
    m.snapshot.mockImplementation(snapshotSimulado(() => true));

    const promesa = copiarProyecto(
      params({
        restic: { ...restic, signal: control.signal },
        deteccion: deteccion(MEDIA),
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    control.abort("Cancelado por ana@vicalba.es");
    const r = await promesa;

    expect(r).toEqual([
      {
        clave: "datos:./data/media",
        ok: false,
        error: "Cancelado por ana@vicalba.es",
      },
    ]);
    expect(m.eliminarAuxiliar).toHaveBeenCalledWith(
      "aux-b1-datos:./data/media",
    );
  });

  it("un ciclo cancelado sin motivo deja el error del proceso", async () => {
    const control = new AbortController();
    m.snapshot.mockImplementation(snapshotSimulado(() => true));

    const promesa = copiarProyecto(
      params({
        restic: { ...restic, signal: control.signal },
        deteccion: deteccion(MEDIA),
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    control.abort();

    expect(await promesa).toEqual([
      { clave: "datos:./data/media", ok: false, error: "restic cancelado" },
    ]);
  });

  it("no recorta los nombres de base: solo quita el retorno de carro final y las líneas vacías", async () => {
    m.ejecutar.mockResolvedValue(" Mi Base \r\n\r\n\ncrm\n");
    await copiarProyecto(params({ restic: restic, deteccion: deteccion(DB) }));
    const nombres = m.snapshot.mock.calls.map(
      ([, p]) => (p as { nombre: string }).nombre,
    );
    expect(nombres).toEqual([
      "/bd/db/%20Mi%20Base%20.sql",
      "/bd/db/crm.sql",
      "/bd/db/_roles.sql",
    ]);
  });

  it("pasa la señal del elemento al listado de bases", async () => {
    await copiarProyecto(params({ restic: restic, deteccion: deteccion(DB) }));

    const opciones = m.ejecutar.mock.calls[0][2] as { signal: AbortSignal };
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(m.snapshot.mock.calls[0][0]).toMatchObject({
      env: restic.env,
      args: restic.args,
      signal: expect.any(AbortSignal),
    });
  });

  it("si no se puede eliminar el auxiliar, avisa y la copia cuenta", async () => {
    m.eliminarAuxiliar.mockRejectedValue(new Error("docker no responde"));

    const r = await copiarProyecto(params({ deteccion: deteccion(MEDIA) }));

    expect(r).toEqual([{ clave: "datos:./data/media", ok: true }]);
    expect(m.warn).toHaveBeenCalledWith(
      expect.objectContaining({ auxiliar: "aux-b1-datos:./data/media" }),
      expect.any(String),
    );
  });

  it("si no se puede cerrar la fila de un elemento, sigue con el resto", async () => {
    m.update.mockRejectedValueOnce(new Error("BD caída"));

    const r = await copiarProyecto(
      params({ deteccion: deteccion(MEDIA, UPLOADS) }),
    );

    expect(r).toEqual([
      { clave: "datos:./data/media", ok: true },
      { clave: "volumen:cli-crm_uploads", ok: true },
    ]);
    expect(m.snapshot).toHaveBeenCalledTimes(2);
    expect(m.error).toHaveBeenCalledWith(
      expect.objectContaining({ clave: "datos:./data/media", backupId: "b1" }),
      expect.any(String),
    );
  });

  it("si no se puede crear la fila, el elemento falla sin copiarse y sigue el resto", async () => {
    m.create.mockRejectedValueOnce(new Error("BD caída"));

    const r = await copiarProyecto(
      params({ deteccion: deteccion(MEDIA, UPLOADS) }),
    );

    expect(r).toEqual([
      { clave: "datos:./data/media", ok: false, error: "BD caída" },
      { clave: "volumen:cli-crm_uploads", ok: true },
    ]);
    expect(m.snapshot).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(m.error).toHaveBeenCalledWith(
      expect.objectContaining({ clave: "datos:./data/media", backupId: "b1" }),
      expect.any(String),
    );
  });

  it("un fallo no Error se registra como texto", async () => {
    m.snapshot.mockRejectedValue("raro");

    const r = await copiarProyecto(params({ deteccion: deteccion(MARIA) }));

    expect(r).toEqual([{ clave: "bd:maria", ok: false, error: "raro" }]);
  });
});
