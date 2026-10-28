import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Deteccion } from "./deteccion";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  elementosUpdateMany: vi.fn(),
  excluidos: vi.fn(),
  proyectos: vi.fn(),
  proyecto: vi.fn(),
  notificar: vi.fn(),
  cargar: vi.fn(),
  comprobar: vi.fn(),
  retencion: vi.fn(),
  podar: vi.fn(),
  copiarPanel: vi.fn(),
  falloSinIniciar: vi.fn(),
  detectar: vi.fn(),
  copiarProyecto: vi.fn(),
  retencionProyectos: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    backup: { create: m.create, update: m.update },
    elementoCopia: { updateMany: m.elementosUpdateMany },
    elementoBackup: { findMany: m.excluidos },
    proyecto: { findMany: m.proyectos, findUnique: m.proyecto },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: m.error, warn: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("./restic", () => ({
  comprobarDestino: m.comprobar,
  aplicarRetencion: m.retencion,
  podar: m.podar,
}));
vi.mock("./copia", () => ({
  copiarPanel: m.copiarPanel,
  registrarFalloSinIniciar: m.falloSinIniciar,
}));
vi.mock("./deteccion", () => ({ detectarProyecto: m.detectar }));
vi.mock("./copiaProyecto", () => ({ copiarProyecto: m.copiarProyecto }));
vi.mock("./retencionProyectos", () => ({
  aplicarRetencionProyectos: m.retencionProyectos,
}));

import {
  NadaQueCopiar,
  iniciarCicloDiario,
  iniciarCopiaProyecto,
} from "./ciclo";
import {
  OperacionEnCurso,
  cancelarOperacion,
  hayOperacionEnCurso,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";

const config = { clave: "c", destino: { tipo: "s3" } };
const valida: Deteccion = {
  valida: true,
  elementos: [
    {
      tipo: "bd",
      clave: "bd:db",
      servicio: "db",
      motor: "postgres",
      contenedorId: "c1",
      enMarcha: true,
    },
    {
      tipo: "datos",
      clave: "datos:./data",
      origen: "/r/acme/web/data",
      montaje: "bind",
      restaurable: true,
    },
  ],
  noCopiados: [],
};
const sinContenedores: Deteccion = {
  valida: false,
  elementos: [],
  noCopiados: [],
};
const A = { id: "pA", nombre: "web", cliente: { slug: "acme" } };
const B = { id: "pB", nombre: "api", cliente: { slug: "beta" } };

type Args = {
  proyecto: { id: string };
  backupId: string;
  restic: { signal: AbortSignal };
  incluidos: (clave: string) => boolean;
};
const todoOk = async (a: Args) =>
  ["bd:db", "datos:./data"]
    .filter(a.incluidos)
    .map((clave) => ({ clave, ok: true }));

const terminado = () =>
  vi.waitFor(() => expect(hayOperacionEnCurso()).toBe(false));

beforeEach(() => {
  vi.clearAllMocks();
  soltarOperacion();
  m.cargar.mockResolvedValue(config);
  m.create.mockImplementation(
    async ({ data }: { data: { proyectoId?: string } }) => ({
      id: data.proyectoId ? `b-${data.proyectoId}` : "panel",
    }),
  );
  m.update.mockResolvedValue({});
  m.elementosUpdateMany.mockResolvedValue({ count: 0 });
  m.excluidos.mockResolvedValue([]);
  m.proyectos.mockResolvedValue([A, B]);
  m.proyecto.mockResolvedValue(A);
  m.comprobar.mockResolvedValue(undefined);
  m.retencion.mockResolvedValue(undefined);
  m.podar.mockResolvedValue(undefined);
  m.copiarPanel.mockResolvedValue(true);
  m.detectar.mockResolvedValue(valida);
  m.copiarProyecto.mockImplementation(todoOk);
  m.retencionProyectos.mockResolvedValue(undefined);
  m.notificar.mockResolvedValue(undefined);
});

describe("iniciarCicloDiario", () => {
  it("Panel, cada Proyecto, retención y una sola poda, en ese orden", async () => {
    expect(await iniciarCicloDiario()).toEqual({ id: "panel" });
    expect(hayOperacionEnCurso()).toBe(true);
    await terminado();

    expect(m.create).toHaveBeenCalledWith({
      data: { operacion: "copia", origen: "programado" },
    });
    expect(m.comprobar).toHaveBeenCalledTimes(1);
    expect(m.copiarPanel).toHaveBeenCalledWith(
      "panel",
      config,
      expect.any(AbortSignal),
      { origen: "programado", comprobar: false, retencion: false },
    );
    expect(m.proyectos).toHaveBeenCalledWith({
      where: { backupsHabilitados: true },
      select: { id: true, nombre: true, cliente: { select: { slug: true } } },
    });
    expect(m.create).toHaveBeenCalledWith({
      data: {
        operacion: "copia",
        origen: "programado",
        proyectoId: "pA",
        proyectoNombre: "acme/web",
      },
    });
    expect(m.copiarProyecto).toHaveBeenNthCalledWith(1, {
      proyecto: { id: "pA", nombre: "web", clienteSlug: "acme" },
      backupId: "b-pA",
      origen: "programado",
      restic: expect.objectContaining({ signal: expect.any(AbortSignal) }),
      deteccion: valida,
      incluidos: expect.any(Function),
    });
    expect(m.copiarProyecto.mock.calls[1]![0].backupId).toBe("b-pB");
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pB" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });

    const orden = [
      m.comprobar,
      m.copiarPanel,
      m.copiarProyecto,
      m.retencion,
      m.retencionProyectos,
      m.podar,
    ].map((f) => f.mock.invocationCallOrder[0]!);
    expect(orden).toEqual([...orden].sort((x, y) => x - y));
    expect(m.copiarProyecto.mock.invocationCallOrder[1]!).toBeLessThan(
      m.retencion.mock.invocationCallOrder[0]!,
    );
    expect(m.podar).toHaveBeenCalledTimes(1);
    expect(m.notificar).not.toHaveBeenCalled();
  });

  it("si falla la copia del Panel, los Proyectos se copian igual (un aviso)", async () => {
    m.copiarPanel.mockImplementation(async () => {
      await m.notificar({
        operacion: "copia",
        origen: "programado",
        error: "x",
      });
      return false;
    });
    await iniciarCicloDiario();
    await terminado();
    expect(m.copiarProyecto).toHaveBeenCalledTimes(2);
    expect(m.podar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledTimes(1);
  });

  it("un elemento fallido de A deja A en error, B en éxito y un aviso de A", async () => {
    m.copiarProyecto.mockImplementation(async (a: Args) =>
      a.proyecto.id === "pA"
        ? [
            {
              clave: "bd:db",
              ok: false,
              error: "El contenedor db está parado",
            },
            { clave: "datos:./data", ok: true },
          ]
        : todoOk(a),
    );
    await iniciarCicloDiario();
    await terminado();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: {
        resultado: "error",
        error: "bd:db: El contenedor db está parado",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pB" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(m.notificar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: "bd:db: El contenedor db está parado",
      proyecto: "acme/web",
    });
  });

  it("con el destino caído: un error del Panel, ningún Proyecto y un aviso", async () => {
    m.comprobar.mockRejectedValue(
      new Error("El destino no responde (30 s): no such host"),
    );
    await iniciarCicloDiario();
    await terminado();
    expect(m.comprobar).toHaveBeenCalledTimes(1);
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "panel" },
      data: {
        resultado: "error",
        error: "El destino no responde (30 s): no such host",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.copiarPanel).not.toHaveBeenCalled();
    expect(m.detectar).not.toHaveBeenCalled();
    expect(m.copiarProyecto).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.podar).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: "El destino no responde (30 s): no such host",
    });
  });

  it("salta sin fila ni aviso un Proyecto sin contenedores o sin nada incluido", async () => {
    m.detectar.mockImplementation(async (cliente: string) =>
      cliente === "acme" ? sinContenedores : valida,
    );
    m.proyectos.mockResolvedValue([A, B, { ...B, id: "pC", nombre: "c" }]);
    m.excluidos.mockImplementation(
      async ({ where }: { where: { proyectoId: string } }) =>
        where.proyectoId === "pC"
          ? [{ clave: "bd:db" }, { clave: "datos:./data" }]
          : [],
    );
    await iniciarCicloDiario();
    await terminado();
    expect(m.excluidos).toHaveBeenCalledWith({
      where: { proyectoId: "pC", incluido: false },
      select: { clave: true },
    });
    expect(m.copiarProyecto).toHaveBeenCalledTimes(1);
    expect(m.copiarProyecto.mock.calls[0]![0].backupId).toBe("b-pB");
    expect(m.create).toHaveBeenCalledTimes(2);
    expect(m.notificar).not.toHaveBeenCalled();
    expect(m.podar).toHaveBeenCalledTimes(1);
  });

  it("pasa a copiarProyecto solo los elementos incluidos", async () => {
    m.excluidos.mockResolvedValue([{ clave: "datos:./data" }]);
    await iniciarCicloDiario();
    await terminado();
    const { incluidos } = m.copiarProyecto.mock.calls[0]![0] as Args;
    expect(incluidos("bd:db")).toBe(true);
    expect(incluidos("datos:./data")).toBe(false);
  });

  it("cancelar corta el ciclo: el motivo llega a los elementos y no se sigue", async () => {
    m.copiarProyecto.mockImplementation(
      (a: Args) =>
        new Promise((resolve) =>
          a.restic.signal.addEventListener("abort", () =>
            resolve([
              {
                clave: "bd:db",
                ok: false,
                error: a.restic.signal.reason as string,
              },
            ]),
          ),
        ),
    );
    await iniciarCicloDiario();
    await vi.waitFor(() => expect(m.copiarProyecto).toHaveBeenCalled());
    expect(cancelarOperacion("Cancelado por ana")).toBe(true);
    await terminado();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: {
        resultado: "error",
        error: "bd:db: Cancelado por ana",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.copiarProyecto).toHaveBeenCalledTimes(1);
    expect(m.create).not.toHaveBeenCalledWith({
      data: expect.objectContaining({ proyectoId: "pB" }),
    });
    expect(m.retencion).not.toHaveBeenCalled();
    expect(m.retencionProyectos).not.toHaveBeenCalled();
    expect(m.podar).not.toHaveBeenCalled();
    expect(cancelarOperacion("otra vez")).toBe(false);
  });

  it("cancelado durante la copia del Panel no empieza ningún Proyecto", async () => {
    m.copiarPanel.mockImplementation(async () => {
      cancelarOperacion("Cancelado por ana");
      return false;
    });
    await iniciarCicloDiario();
    await terminado();
    expect(m.detectar).not.toHaveBeenCalled();
    expect(m.podar).not.toHaveBeenCalled();
  });

  it("cierra en error los elementos que quedaron en curso y la copia con ellos", async () => {
    m.elementosUpdateMany.mockImplementation(
      async ({ where }: { where: { backupId: string } }) => ({
        count: where.backupId === "b-pA" ? 1 : 0,
      }),
    );
    await iniciarCicloDiario();
    await terminado();
    expect(m.elementosUpdateMany).toHaveBeenCalledWith({
      where: { backupId: "b-pA", resultado: "en_curso" },
      data: {
        resultado: "error",
        error: "No se pudo registrar el resultado del elemento",
      },
    });
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: {
        resultado: "error",
        error: "No se pudo registrar el resultado del elemento",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.notificar).toHaveBeenCalledTimes(1);
  });

  it("si copiarProyecto lanza, la copia de ese Proyecto queda en error", async () => {
    m.copiarProyecto.mockImplementation(async (a: Args) => {
      if (a.proyecto.id === "pA") throw new Error("inesperado");
      return todoOk(a);
    });
    await iniciarCicloDiario();
    await terminado();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: {
        resultado: "error",
        error: "inesperado",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.copiarProyecto).toHaveBeenCalledTimes(2);
  });

  it("si no se puede registrar un Proyecto, avisa de él y sigue con el resto", async () => {
    m.create.mockImplementation(
      async ({ data }: { data: { proyectoId?: string } }) => {
        if (data.proyectoId === "pA") throw new Error("BD caída");
        return { id: data.proyectoId ? `b-${data.proyectoId}` : "panel" };
      },
    );
    await iniciarCicloDiario();
    await terminado();
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: "BD caída",
      proyecto: "acme/web",
    });
    expect(m.copiarProyecto).toHaveBeenCalledTimes(1);
    expect(m.podar).toHaveBeenCalledTimes(1);
  });

  it("si falla la retención, lo registra y avisa una vez", async () => {
    m.retencionProyectos.mockRejectedValue(new Error("repository is locked"));
    await iniciarCicloDiario();
    await terminado();
    expect(m.error).toHaveBeenCalled();
    expect(m.podar).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledTimes(1);
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: "repository is locked",
    });
  });

  it("si no se puede registrar el destino caído, lo deja en el log", async () => {
    m.comprobar.mockRejectedValue(new Error("no such host"));
    m.update.mockRejectedValue(new Error("BD caída"));
    await iniciarCicloDiario();
    await terminado();
    expect(m.error).toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: "BD caída",
    });
  });

  it("sin configuración válida registra el fallo y no toma el bloqueo", async () => {
    m.cargar.mockRejectedValue(new Error("Backups sin configurar"));
    await expect(iniciarCicloDiario()).rejects.toThrow(
      "Backups sin configurar",
    );
    expect(m.falloSinIniciar).toHaveBeenCalledWith(
      new Error("Backups sin configurar"),
    );
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("con otra operación en curso no crea fila", async () => {
    tomarOperacion();
    await expect(iniciarCicloDiario()).rejects.toBeInstanceOf(OperacionEnCurso);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("si no se puede crear la fila del Panel, suelta el bloqueo", async () => {
    m.create.mockRejectedValue(new Error("BD caída"));
    await expect(iniciarCicloDiario()).rejects.toThrow("BD caída");
    expect(hayOperacionEnCurso()).toBe(false);
  });
});

describe("iniciarCopiaProyecto", () => {
  it("copia solo ese Proyecto, sin retención ni poda", async () => {
    expect(await iniciarCopiaProyecto("pA")).toEqual({ id: "b-pA" });
    await terminado();
    expect(m.proyecto).toHaveBeenCalledWith({
      where: { id: "pA" },
      select: { id: true, nombre: true, cliente: { select: { slug: true } } },
    });
    expect(m.create).toHaveBeenCalledWith({
      data: {
        operacion: "copia",
        origen: "manual",
        proyectoId: "pA",
        proyectoNombre: "acme/web",
      },
    });
    expect(m.comprobar).toHaveBeenCalledTimes(1);
    expect(m.copiarProyecto).toHaveBeenCalledWith(
      expect.objectContaining({ backupId: "b-pA", origen: "manual" }),
    );
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(m.copiarPanel).not.toHaveBeenCalled();
    expect(m.retencion).not.toHaveBeenCalled();
    expect(m.retencionProyectos).not.toHaveBeenCalled();
    expect(m.podar).not.toHaveBeenCalled();
  });

  it("con el destino caído: la copia en error y un aviso del Proyecto", async () => {
    m.comprobar.mockRejectedValue(new Error("no such host"));
    await iniciarCopiaProyecto("pA");
    await terminado();
    expect(m.copiarProyecto).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b-pA" },
      data: {
        resultado: "error",
        error: "no such host",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "manual",
      error: "no such host",
      proyecto: "acme/web",
    });
  });

  it("si no se puede cerrar la fila, lo deja en el log y suelta el bloqueo", async () => {
    m.update.mockRejectedValue(new Error("BD caída"));
    await iniciarCopiaProyecto("pA");
    await terminado();
    expect(m.error).toHaveBeenCalled();
  });

  it("sin contenedores: No hay nada que copiar, sin fila", async () => {
    m.detectar.mockResolvedValue(sinContenedores);
    const err = await iniciarCopiaProyecto("pA").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NadaQueCopiar);
    expect((err as Error).message).toBe(
      "No hay nada que copiar: el Proyecto no tiene contenedores",
    );
    expect(m.create).not.toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("sin nada incluido: No hay nada que copiar", async () => {
    m.excluidos.mockResolvedValue([
      { clave: "bd:db" },
      { clave: "datos:./data" },
    ]);
    await expect(iniciarCopiaProyecto("pA")).rejects.toThrow(
      "No hay nada que copiar: ninguna BD ni carpeta de datos incluida",
    );
    expect(m.create).not.toHaveBeenCalled();
  });

  it("con otra operación en curso: OperacionEnCurso", async () => {
    tomarOperacion();
    await expect(iniciarCopiaProyecto("pA")).rejects.toBeInstanceOf(
      OperacionEnCurso,
    );
    expect(m.detectar).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("Proyecto inexistente: error y bloqueo suelto", async () => {
    m.proyecto.mockResolvedValue(null);
    await expect(iniciarCopiaProyecto("x")).rejects.toThrow(
      "El Proyecto no existe",
    );
    expect(hayOperacionEnCurso()).toBe(false);
  });
});
