import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cargar: vi.fn(),
  hacerCopia: vi.fn(),
  restaurarSnapshot: vi.fn(),
  pgRestore: vi.fn(),
  ejecutar: vi.fn(),
  backupCreate: vi.fn(),
  backupUpdate: vi.fn(),
  backupFindMany: vi.fn(),
  backupDeleteMany: vi.fn(),
  backupCreateMany: vi.fn(),
  elementoFindMany: vi.fn(),
  elementoCreateMany: vi.fn(),
  configFind: vi.fn(),
  configUpsert: vi.fn(),
  credFind: vi.fn(),
  credUpsert: vi.fn(),
  transaction: vi.fn(),
  disconnect: vi.fn(),
  notificar: vi.fn(),
  reemplazarDinamica: vi.fn(),
  leerProxy: vi.fn(),
  lanzarProxy: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://u:p@db/bd",
    TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic",
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    backup: {
      create: m.backupCreate,
      update: m.backupUpdate,
      findMany: m.backupFindMany,
      deleteMany: m.backupDeleteMany,
      createMany: m.backupCreateMany,
    },
    elementoCopia: {
      findMany: m.elementoFindMany,
      createMany: m.elementoCreateMany,
    },
    configuracionBackup: { findUnique: m.configFind, upsert: m.configUpsert },
    credencial: { findUnique: m.credFind, upsert: m.credUpsert },
    $transaction: m.transaction,
    $disconnect: m.disconnect,
  },
}));
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("./copia", () => ({ hacerCopia: m.hacerCopia }));
vi.mock("@/lib/proxy/operacion", () => ({
  leerConfiguracionProxy: m.leerProxy,
  lanzarAplicacionProxy: m.lanzarProxy,
}));
vi.mock("./restic", () => ({ restaurarSnapshot: m.restaurarSnapshot }));
vi.mock("./postgres", () => ({ pgRestore: m.pgRestore }));
vi.mock("./procesos", () => ({ ejecutar: m.ejecutar }));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  return { ...real, mkdtemp: vi.fn(real.mkdtemp) };
});

import {
  buscarFichero,
  iniciarRestauracion,
  reemplazarConfigTraefik,
} from "./restaurar";
import {
  OperacionEnCurso,
  hayOperacionEnCurso,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";

// The restore touches the real filesystem, so wait for it to release the lock
// instead of counting ticks.
const terminar = () =>
  vi.waitFor(() => expect(hayOperacionEnCurso()).toBe(false));
let tmp: string;

describe("buscarFichero", () => {
  afterAll(() => rm(tmp, { recursive: true, force: true }));
  it("encuentra el fichero a cualquier profundidad o devuelve null", async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "buscar-"));
    await mkdir(path.join(tmp, "tmp", "vicalba-backup-x"), { recursive: true });
    await writeFile(
      path.join(tmp, "tmp", "vicalba-backup-x", "panel-db.dump"),
      "x",
    );
    expect(await buscarFichero(tmp, "panel-db.dump")).toBe(
      path.join(tmp, "tmp", "vicalba-backup-x", "panel-db.dump"),
    );
    expect(await buscarFichero(tmp, "no-existe")).toBeNull();
  });
});

describe("iniciarRestauracion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    soltarOperacion();
    m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "sftp" } });
    m.hacerCopia.mockResolvedValue(undefined);
    m.backupUpdate.mockResolvedValue({});
    m.restaurarSnapshot.mockResolvedValue(undefined);
    m.backupCreate
      .mockResolvedValueOnce({ id: "previa" })
      .mockResolvedValueOnce({ id: "rest" });
    m.configFind.mockResolvedValue({
      id: "default",
      sftpCredencialId: "cred1",
      hora: 3,
    });
    m.credFind.mockResolvedValue({ id: "cred1", nombre: "backups" });
    m.backupFindMany.mockResolvedValue([{ id: "previa" }]);
    m.elementoFindMany.mockResolvedValue([{ id: "el1", backupId: "previa" }]);
    m.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    m.leerProxy.mockResolvedValue({ aplicada: { logNivel: "INFO" } });
    m.lanzarProxy.mockResolvedValue({ terminado: Promise.resolve() });
  });

  it("copia previa, restaura la BD, conserva lo de backups, migra, restaura Traefik y marca éxito", async () => {
    // restaurarSnapshot crea los ficheros donde buscarFichero los encontrará: lo
    // simulamos con una implementación que escribe en la carpeta destino.
    m.restaurarSnapshot.mockImplementation(
      async (_r: unknown, _id: string, destino: string) => {
        await mkdir(path.join(destino, "x", "traefik", "dynamic"), {
          recursive: true,
        });
        await writeFile(path.join(destino, "x", "panel-db.dump"), "dump");
      },
    );
    expect(await iniciarRestauracion("abc123")).toEqual({ id: "rest" });
    await terminar();

    expect(m.backupCreate).toHaveBeenNthCalledWith(1, {
      data: { operacion: "copia", origen: "antes_de_restaurar" },
    });
    // Retention on the safety copy could prune the very snapshot being restored.
    expect(m.hacerCopia).toHaveBeenCalledWith(
      "previa",
      expect.anything(),
      expect.any(AbortSignal),
      { retencion: false },
    );
    // Migrate first: the saved rows have the current schema.
    expect(m.ejecutar.mock.invocationCallOrder[0]!).toBeLessThan(
      m.transaction.mock.invocationCallOrder[0]!,
    );
    expect(m.backupCreate).toHaveBeenNthCalledWith(2, {
      data: {
        operacion: "restauracion",
        origen: "manual",
        snapshotId: "abc123",
      },
    });
    expect(m.pgRestore).toHaveBeenCalledWith(
      "postgresql://u:p@db/bd",
      expect.stringContaining("panel-db.dump"),
      expect.any(AbortSignal),
    );
    expect(m.credUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cred1" } }),
    );
    expect(m.configUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "default" } }),
    );
    expect(m.backupDeleteMany).toHaveBeenCalled();
    expect(m.backupCreateMany).toHaveBeenCalledWith({
      data: [{ id: "previa" }],
    });
    expect(m.elementoCreateMany).toHaveBeenCalledWith({
      data: [{ id: "el1", backupId: "previa" }],
    });
    expect(m.backupCreateMany.mock.invocationCallOrder[0]!).toBeLessThan(
      m.elementoCreateMany.mock.invocationCallOrder[0]!,
    );
    expect(m.ejecutar).toHaveBeenCalledWith(
      "npx",
      ["prisma", "migrate", "deploy"],
      expect.anything(),
    );
    expect(m.disconnect).toHaveBeenCalled();
    // The restored Proxy config goes through the safe apply (rollback included).
    expect(m.lanzarProxy).toHaveBeenCalledWith({ logNivel: "INFO" });
    expect(m.backupUpdate).toHaveBeenLastCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si no se puede volver a aplicar el Proxy restaurado, la restauración no falla", async () => {
    m.restaurarSnapshot.mockImplementation(
      async (_r: unknown, _id: string, destino: string) => {
        await mkdir(path.join(destino, "x"), { recursive: true });
        await writeFile(path.join(destino, "x", "panel-db.dump"), "dump");
      },
    );
    m.lanzarProxy.mockRejectedValue(new Error("ya hay una en curso"));

    await iniciarRestauracion("abc123");
    await terminar();

    expect(m.backupUpdate).toHaveBeenLastCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
  });

  it("si la copia previa falla no toca la BD", async () => {
    m.hacerCopia.mockRejectedValue(new Error("destino caído"));
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.pgRestore).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "restauracion",
      origen: "manual",
      error: expect.stringContaining("copia previa"),
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si el snapshot no contiene el dump, falla sin tocar la BD", async () => {
    m.restaurarSnapshot.mockResolvedValue(undefined);
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.pgRestore).not.toHaveBeenCalled();
    expect(m.backupUpdate).toHaveBeenLastCalledWith({
      where: { id: "rest" },
      data: {
        resultado: "error",
        error: "La copia no contiene panel-db.dump",
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("sin configuración guardada solo conserva el historial", async () => {
    m.configFind.mockResolvedValue(null);
    m.restaurarSnapshot.mockImplementation(
      async (_r: unknown, _id: string, destino: string) => {
        await writeFile(path.join(destino, "panel-db.dump"), "dump");
      },
    );
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.credFind).not.toHaveBeenCalled();
    expect(m.credUpsert).not.toHaveBeenCalled();
    expect(m.configUpsert).not.toHaveBeenCalled();
    expect(m.backupDeleteMany).toHaveBeenCalled();
    expect(m.backupCreateMany).toHaveBeenCalled();
  });

  it("si no se puede crear la fila, suelta la operación", async () => {
    m.backupCreate.mockReset().mockRejectedValue(new Error("BD caída"));
    await expect(iniciarRestauracion("abc123")).rejects.toThrow("BD caída");
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("con rechazos que no son Error y sin poder registrar el fallo, no lanza y suelta la operación", async () => {
    m.restaurarSnapshot.mockRejectedValue("sin red");
    m.backupUpdate.mockRejectedValue(new Error("BD caída"));
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.backupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ error: "sin red" }),
      }),
    );
    expect(m.notificar).not.toHaveBeenCalled();
  });

  it("la copia previa rechazada sin Error también se explica", async () => {
    m.hacerCopia.mockRejectedValue("sin espacio");
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "No se restauró: falló la copia previa (sin espacio)",
      }),
    );
  });

  it("al superar el límite se cancela con un motivo claro", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    m.hacerCopia.mockImplementation(
      (_id: string, _c: unknown, signal: AbortSignal) =>
        new Promise((_, rej) => {
          const cancelar = () =>
            rej(new DOMException("This operation was aborted", "AbortError"));
          if (signal.aborted) cancelar();
          else signal.addEventListener("abort", cancelar);
        }),
    );
    await iniciarRestauracion("abc123");
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    vi.useRealTimers();
    await terminar();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        error:
          "No se restauró: falló la copia previa (Cancelado: superó 60 minutos)",
      }),
    );
  });

  it("si no se puede crear la carpeta temporal, falla y suelta la operación", async () => {
    vi.mocked(mkdtemp).mockRejectedValueOnce(new Error("ENOSPC"));
    await iniciarRestauracion("abc123");
    await terminar();
    expect(m.hacerCopia).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith(
      expect.objectContaining({ error: "ENOSPC" }),
    );
  });

  it("rechaza si hay otra operación en curso", async () => {
    tomarOperacion();
    await expect(iniciarRestauracion("abc123")).rejects.toBeInstanceOf(
      OperacionEnCurso,
    );
    expect(m.backupCreate).not.toHaveBeenCalled();
  });
});

describe("reemplazarConfigTraefik", () => {
  it("deja en el destino exactamente los ficheros del origen", async () => {
    const raiz = await mkdtemp(path.join(tmpdir(), "traefik-"));
    try {
      const origen = path.join(raiz, "origen");
      const destino = path.join(raiz, "destino");
      await mkdir(origen);
      await mkdir(path.join(destino, "viejo"), { recursive: true });
      await writeFile(path.join(origen, "proyecto.yml"), "nuevo");
      await writeFile(path.join(destino, "proyecto.yml"), "antiguo");
      await writeFile(path.join(destino, "borrado.yml"), "x");

      await reemplazarConfigTraefik(origen, destino);

      expect((await readdir(destino)).sort()).toEqual(["proyecto.yml"]);
      expect(await readFile(path.join(destino, "proyecto.yml"), "utf8")).toBe(
        "nuevo",
      );
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  });
});
