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
  crearSnapshotStdin,
  listarSnapshots,
  listarSnapshotsProyectos,
  olvidar,
  parsearSnapshotsProyectos,
  podar,
  volcarSnapshot,
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
      "--no-lock",
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

const base = ["-o", "sftp.command=ssh"];

describe("snapshots de Proyectos", () => {
  it("crearSnapshotStdin: backup desde comando con etiquetas y nombre", async () => {
    mockEjecutar.mockResolvedValueOnce(SALIDA_BACKUP);
    const res = await crearSnapshotStdin(r, {
      proceso: { comando: "docker", args: ["exec", "c", "sh"] },
      nombre: "bd-x.dump",
      etiquetas: ["proyecto", "p:1"],
    });
    expect(res.bytesAnadidos).toBe(123456);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      ...base,
      "backup",
      "--json",
      "--quiet",
      "--host",
      "vicalba-panel",
      "--tag",
      "proyecto",
      "--tag",
      "p:1",
      "--stdin-filename",
      "bd-x.dump",
      "--stdin-from-command",
      "--",
      "docker",
      "exec",
      "c",
      "sh",
    ]);
  });

  it("parsearSnapshotsProyectos: lee etiquetas y ruta, descarta incompletos", () => {
    const t = "2026-10-14T01:00:00+00:00";
    const salida = JSON.stringify([
      {
        id: "a",
        time: "2026-10-12T01:00:00+00:00",
        paths: ["/bd-x.dump"],
        tags: ["proyecto", "p:1", "e:h1", "c:b1", "o:manual"],
        summary: { total_bytes_processed: 10 },
      },
      {
        id: "b",
        time: "2026-10-13T01:00:00+00:00",
        paths: ["/d"],
        tags: ["proyecto", "p:1", "e:h2", "c:b1", "o:programado"],
      },
      { id: "c", time: t, paths: ["/d"], tags: ["panel"] },
      {
        id: "d",
        time: t,
        paths: ["/d"],
        tags: ["p:1", "e:h", "c:b", "o:raro"],
      },
      { id: "e", time: t, paths: [], tags: ["p:1", "e:h", "c:b", "o:manual"] },
      { id: "f", time: t },
    ]);
    const res = parsearSnapshotsProyectos(salida);
    expect(res.map((s) => s.id)).toEqual(["b", "a"]);
    expect(res[1]).toEqual({
      id: "a",
      fecha: new Date("2026-10-12T01:00:00+00:00"),
      bytes: 10,
      ruta: "/bd-x.dump",
      proyectoId: "1",
      hashElemento: "h1",
      backupId: "b1",
      origen: "manual",
    });
    expect(res[0]!.bytes).toBeNull();
  });

  it("listarSnapshotsProyectos: filtra por proyecto o todos", async () => {
    mockEjecutar.mockResolvedValue("[]");
    await listarSnapshotsProyectos(r, "7");
    await listarSnapshotsProyectos(r);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      ...base,
      "snapshots",
      "--json",
      "--no-lock",
      "--tag",
      "proyecto,p:7",
    ]);
    expect(mockEjecutar.mock.calls[1]![1].at(-1)).toBe("proyecto");
  });

  it("olvidar: 7+4, 30d y todo (solo por ids)", async () => {
    mockEjecutar.mockResolvedValue("[]");
    await olvidar(r, { etiquetas: ["proyecto", "p:1"], politica: "7+4" });
    await olvidar(r, { etiquetas: ["proyecto"], politica: "30d" });
    await olvidar(r, {
      etiquetas: ["proyecto"],
      politica: "todo",
      ids: ["a", "b"],
    });
    await olvidar(r, { etiquetas: ["proyecto"], politica: "todo" });
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      ...base,
      "forget",
      "--json",
      "--tag",
      "proyecto,p:1",
      "--group-by",
      "host,paths",
      "--keep-daily",
      "7",
      "--keep-weekly",
      "4",
    ]);
    expect(mockEjecutar.mock.calls[1]![1].slice(-2)).toEqual([
      "--keep-within",
      "30d",
    ]);
    expect(mockEjecutar.mock.calls[2]![1]).toEqual([
      ...base,
      "forget",
      "--json",
      "a",
      "b",
    ]);
    expect(mockEjecutar).toHaveBeenCalledTimes(3);
  });

  it("podar y volcarSnapshot", async () => {
    mockEjecutar.mockResolvedValueOnce("");
    await podar(r);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([...base, "prune"]);
    expect(volcarSnapshot(r, "abc", "/x.dump")).toEqual({
      comando: "restic",
      args: [...base, "dump", "abc", "/x.dump"],
      env: r.env,
    });
  });
});
