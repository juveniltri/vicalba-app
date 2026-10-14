import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  cargar: vi.fn(),
  crearSnapshot: vi.fn(),
  retencion: vi.fn(),
  pgDump: vi.fn(),
  leerTraefik: vi.fn(),
  notificar: vi.fn(),
  fs: {
    mkdtemp: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    cp: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://u:p@db/bd",
    TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic",
    ACME_JSON_PATH: "/letsencrypt/acme.json",
    REPOS_DIR: "/r",
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { backup: { create: m.create, update: m.update } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/lib/docker/traefik", () => ({ leerFicheroTraefik: m.leerTraefik }));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("node:fs/promises", () => m.fs);
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("./restic", () => ({
  crearSnapshot: m.crearSnapshot,
  aplicarRetencion: m.retencion,
}));
vi.mock("./postgres", () => ({ pgDump: m.pgDump }));

import { iniciarCopia } from "./copia";
import {
  OperacionEnCurso,
  hayOperacionEnCurso,
  soltarOperacion,
} from "./operacion";

const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  soltarOperacion();
  m.create.mockResolvedValue({ id: "b1" });
  m.update.mockResolvedValue({});
  m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "s3" } });
  m.fs.mkdtemp.mockResolvedValue("/tmp/vicalba-backup-x");
  m.pgDump.mockResolvedValue(undefined);
  m.leerTraefik.mockResolvedValue('{"letsencrypt":{}}');
  m.crearSnapshot.mockResolvedValue({
    snapshotId: "snap1",
    bytesAnadidos: 4096,
  });
});

describe("iniciarCopia", () => {
  it("prepara dump + Traefik, sube, aplica retención, marca éxito y borra la carpeta", async () => {
    expect(await iniciarCopia("manual")).toEqual({ id: "b1" });
    await esperar();

    expect(m.create).toHaveBeenCalledWith({
      data: { operacion: "copia", origen: "manual" },
    });
    expect(m.pgDump).toHaveBeenCalledWith(
      "postgresql://u:p@db/bd",
      "/tmp/vicalba-backup-x/panel-db.dump",
      expect.any(AbortSignal),
    );
    expect(m.fs.cp).toHaveBeenCalledWith(
      "/etc/traefik/dynamic",
      "/tmp/vicalba-backup-x/traefik/dynamic",
      { recursive: true },
    );
    expect(m.fs.writeFile).toHaveBeenCalledWith(
      "/tmp/vicalba-backup-x/traefik/acme.json",
      '{"letsencrypt":{}}',
      { mode: 0o600 },
    );
    expect(m.crearSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      "/tmp/vicalba-backup-x",
    );
    expect(m.retencion).toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: {
        resultado: "exito",
        snapshotId: "snap1",
        bytesAnadidos: BigInt(4096),
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.fs.rm).toHaveBeenCalledWith("/tmp/vicalba-backup-x", {
      recursive: true,
      force: true,
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("sin acme.json legible la copia sigue (los certificados se regeneran)", async () => {
    m.leerTraefik.mockRejectedValue(new Error("no such container"));
    await iniciarCopia("programado");
    await esperar();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resultado: "exito" }),
      }),
    );
  });

  it("si falla un paso: error con el motivo, aviso y carpeta borrada", async () => {
    m.pgDump.mockRejectedValue(
      new Error("pg_dump terminó con código 1:\nconnection refused"),
    );
    await iniciarCopia("programado");
    await esperar();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: {
        resultado: "error",
        error: "pg_dump terminó con código 1:\nconnection refused",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: expect.stringContaining("connection refused"),
    });
    expect(m.fs.rm).toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("rechaza una segunda copia mientras hay otra en curso sin crear otra fila", async () => {
    m.crearSnapshot.mockReturnValue(new Promise(() => {}));
    await iniciarCopia("manual");
    await expect(iniciarCopia("manual")).rejects.toBeInstanceOf(
      OperacionEnCurso,
    );
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("sin configuración no toma la operación ni crea fila", async () => {
    m.cargar.mockRejectedValue(
      new Error("Backups sin configurar: no hay destino"),
    );
    await expect(iniciarCopia("manual")).rejects.toThrow("no hay destino");
    expect(m.create).not.toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si no se puede crear la fila, suelta la operación", async () => {
    m.create.mockRejectedValue(new Error("BD caída"));
    await expect(iniciarCopia("manual")).rejects.toThrow("BD caída");
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si no se puede registrar el fallo, no lanza y suelta la operación", async () => {
    m.pgDump.mockRejectedValue("fallo sin Error");
    m.update.mockRejectedValue(new Error("BD caída"));
    await iniciarCopia("programado");
    await esperar();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error: "fallo sin Error" }),
      }),
    );
    expect(m.notificar).not.toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("al superar el límite se cancela con un motivo claro", async () => {
    vi.useFakeTimers();
    m.crearSnapshot.mockImplementation(
      (r: { signal: AbortSignal }) =>
        new Promise((_, rej) =>
          r.signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    await iniciarCopia("manual");
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    vi.useRealTimers();
    await esperar();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultado: "error",
          error: "Cancelado: superó 60 minutos",
        }),
      }),
    );
  });
});
