import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEjecutar } = vi.hoisted(() => ({ mockEjecutar: vi.fn() }));
vi.mock("./procesos", async (original) => ({
  ...(await original<typeof import("./procesos")>()),
  ejecutar: mockEjecutar,
}));

import { ErrorProceso } from "./procesos";
import {
  abrirOInicializar,
  aplicarRetencion,
  crearSnapshot,
  listarSnapshots,
  parsearResumenBackup,
  parsearSnapshots,
  comprobarDestino,
  mensajeSinRespuesta,
  resumirErrorRestic,
  restaurarSnapshot,
  type Restic,
} from "./restic";

const r: Restic = {
  env: { RESTIC_PASSWORD: "x" },
  args: ["-o", "sftp.command=ssh"],
};

const SALIDA_BACKUP = [
  '{"message_type":"status","percent_done":0.5}',
  '{"message_type":"summary","files_new":3,"data_added":123456,"snapshot_id":"4f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a"}',
].join("\n");

const SALIDA_SNAPSHOTS = JSON.stringify([
  {
    id: "aaa111",
    time: "2026-10-12T01:00:03.1+00:00",
    tags: ["panel"],
    summary: { total_bytes_processed: 2048 },
  },
  { id: "bbb222", time: "2026-10-13T01:00:02.9+00:00", tags: ["panel"] },
]);

beforeEach(() => vi.clearAllMocks());

describe("parsearResumenBackup", () => {
  it("lee snapshot_id y data_added de la línea summary", () => {
    expect(parsearResumenBackup(SALIDA_BACKUP)).toEqual({
      snapshotId:
        "4f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
      bytesAnadidos: 123456,
    });
  });

  it("falla si restic no devolvió resumen", () => {
    expect(() => parsearResumenBackup('{"message_type":"status"}')).toThrow(
      "restic no devolvió el resumen de la copia",
    );
  });
});

describe("parsearSnapshots", () => {
  it("ordena de más reciente a más antigua y lee el tamaño si existe", () => {
    expect(parsearSnapshots(SALIDA_SNAPSHOTS)).toEqual([
      {
        id: "bbb222",
        fecha: new Date("2026-10-13T01:00:02.9+00:00"),
        bytes: null,
      },
      {
        id: "aaa111",
        fecha: new Date("2026-10-12T01:00:03.1+00:00"),
        bytes: 2048,
      },
    ]);
  });

  it("acepta la lista vacía y rechaza un JSON con otra forma", () => {
    expect(parsearSnapshots("[]")).toEqual([]);
    expect(() => parsearSnapshots('{"no":"lista"}')).toThrow();
  });
});

describe("abrirOInicializar", () => {
  it("reutiliza un repositorio existente si la clave lo abre", async () => {
    mockEjecutar.mockResolvedValueOnce("{}");
    expect(await abrirOInicializar(r)).toBe("existente");
    expect(mockEjecutar).toHaveBeenCalledWith(
      "restic",
      ["-o", "sftp.command=ssh", "cat", "config"],
      {
        env: r.env,
        signal: undefined,
      },
    );
  });

  it("inicializa si el repositorio no existe (código 10)", async () => {
    mockEjecutar
      .mockRejectedValueOnce(new ErrorProceso("no existe", 10, ""))
      .mockResolvedValueOnce("{}");
    expect(await abrirOInicializar(r)).toBe("inicializado");
    expect(mockEjecutar).toHaveBeenLastCalledWith(
      "restic",
      ["-o", "sftp.command=ssh", "init"],
      {
        env: r.env,
        signal: undefined,
      },
    );
  });

  it("explica que la clave no abre el repositorio (código 12)", async () => {
    mockEjecutar.mockRejectedValueOnce(new ErrorProceso("mala clave", 12, ""));
    await expect(abrirOInicializar(r)).rejects.toThrow(
      "La clave no abre el repositorio existente",
    );
  });

  it("propaga cualquier otro error (red, credenciales)", async () => {
    mockEjecutar.mockRejectedValueOnce(
      new ErrorProceso("403 Forbidden", 1, ""),
    );
    await expect(abrirOInicializar(r)).rejects.toThrow("403 Forbidden");
  });
});

describe("comandos", () => {
  it("crearSnapshot: etiqueta panel, host fijo y carpeta como directorio de trabajo", async () => {
    mockEjecutar.mockResolvedValueOnce(SALIDA_BACKUP);
    const res = await crearSnapshot(r, "/tmp/copia");
    expect(res.bytesAnadidos).toBe(123456);
    expect(mockEjecutar).toHaveBeenCalledWith(
      "restic",
      [
        "-o",
        "sftp.command=ssh",
        "backup",
        "--json",
        "--tag",
        "panel",
        "--host",
        "vicalba-panel",
        ".",
      ],
      { env: r.env, cwd: "/tmp/copia", signal: undefined },
    );
  });

  it("aplicarRetencion: 7 diarias y 4 semanales por etiqueta", async () => {
    mockEjecutar.mockResolvedValueOnce("[]");
    await aplicarRetencion(r);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "forget",
      "--json",
      "--tag",
      "panel",
      "--group-by",
      "host,tags",
      "--keep-daily",
      "7",
      "--keep-weekly",
      "4",
      "--prune",
    ]);
  });

  it("listarSnapshots: solo los de la etiqueta panel", async () => {
    mockEjecutar.mockResolvedValueOnce(SALIDA_SNAPSHOTS);
    expect(await listarSnapshots(r)).toHaveLength(2);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "snapshots",
      "--json",
      "--tag",
      "panel",
    ]);
  });

  it("restaurarSnapshot: restaura el snapshot en la carpeta indicada", async () => {
    mockEjecutar.mockResolvedValueOnce("");
    await restaurarSnapshot(r, "bbb222", "/tmp/restaurar");
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "restore",
      "bbb222",
      "--target",
      "/tmp/restaurar",
    ]);
  });
});

describe("resumirErrorRestic", () => {
  it("se queda con el motivo del último reintento", () => {
    expect(
      resumirErrorRestic(
        [
          "restic cancelado:",
          "Stat(<config/>) returned error, retrying after 668.7ms: Stat: Access Denied",
          'Stat(<config/>) returned error, retrying after 2.89s: Stat: Get "https://noexiste:8333/b/?location=": dial tcp: lookup noexiste: no such host',
        ].join("\n"),
      ),
    ).toBe(
      'Stat: Get "https://noexiste:8333/b/?location=": dial tcp: lookup noexiste: no such host',
    );
  });

  it("sin reintentos en la salida no hay motivo", () => {
    expect(resumirErrorRestic("restic cancelado")).toBeNull();
  });
});

describe("comprobarDestino", () => {
  const cancelado = (stderr: string) =>
    Object.assign(new ErrorProceso(`restic cancelado:\n${stderr}`, null, ""), {
      name: "AbortError",
    });

  it("abre el repositorio con un límite propio de tiempo", async () => {
    mockEjecutar.mockResolvedValueOnce("{}");
    await comprobarDestino(r);
    const [, args, opciones] = mockEjecutar.mock.calls[0]!;
    expect(args).toEqual(["-o", "sftp.command=ssh", "cat", "config"]);
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("si no responde, explica el motivo del último reintento", async () => {
    mockEjecutar.mockRejectedValueOnce(
      cancelado(
        "Stat(<config/>) returned error, retrying after 1s: Stat: Access Denied",
      ),
    );
    await expect(comprobarDestino(r)).rejects.toThrow(
      "El destino no responde (30 s): Stat: Access Denied",
    );
  });

  it("sin motivo legible lo dice igualmente", async () => {
    mockEjecutar.mockRejectedValueOnce(cancelado("sin más"));
    await expect(comprobarDestino(r)).rejects.toThrow(
      /^El destino no responde \(30 s\)$/,
    );
  });

  it("propaga los demás errores (clave incorrecta, red)", async () => {
    mockEjecutar.mockRejectedValueOnce(new ErrorProceso("mala clave", 12, ""));
    await expect(comprobarDestino(r)).rejects.toThrow("mala clave");
  });

  it("si se cancela la operación de fuera, no lo disfraza de destino caído", async () => {
    const controller = new AbortController();
    controller.abort("Cancelado: superó 60 minutos");
    mockEjecutar.mockRejectedValueOnce(cancelado("lo que sea"));
    await expect(
      comprobarDestino({ ...r, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("mensajeSinRespuesta", () => {
  it("solo traduce las cancelaciones", () => {
    expect(mensajeSinRespuesta(new Error("otra cosa"))).toBeNull();
    expect(mensajeSinRespuesta("texto")).toBeNull();
  });
});
