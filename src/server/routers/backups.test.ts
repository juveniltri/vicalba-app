import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    REPOS_DIR: "/var/vicalba/repos",
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test",
    NEXTAUTH_SECRET: "test-secret",
    ENCRYPTION_KEY: "0".repeat(64),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

// Modules the other routers import, so that _app.ts loads in tests.
vi.mock("@/lib/docker/proyectos", () => ({
  iniciarProyecto: vi.fn(),
  detenerProyecto: vi.fn(),
  restartProyecto: vi.fn(),
  DockerError: class DockerError extends Error {},
}));
vi.mock("@/lib/traefik/config", () => ({
  generarConfigTraefik: vi.fn(),
  escribirConfigTraefik: vi.fn(),
  eliminarConfigTraefik: vi.fn(),
}));
vi.mock("@/lib/docker/deploy", () => ({ deployProyecto: vi.fn() }));
vi.mock("@/lib/docker/networks", () => ({
  asegurarRedCliente: vi.fn(),
  eliminarRedCliente: vi.fn(),
}));
vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: vi.fn(),
  desconectarTraefikDeRed: vi.fn(),
}));
vi.mock("@/lib/ssl/acme", () => ({ leerCertificados: vi.fn() }));
vi.mock("@/lib/notificaciones", () => ({
  enviarNotificacion: vi.fn(),
  enviarEmailDePrueba: vi.fn(),
  notificarFalloBackup: vi.fn(),
}));
vi.mock("@/lib/docker/deploys", () => ({ ejecutarDeploy: vi.fn() }));

const m = vi.hoisted(() => ({
  configFind: vi.fn(),
  configUpsert: vi.fn(),
  configUpdate: vi.fn(),
  credFind: vi.fn(),
  backupFindMany: vi.fn(),
  backupFindFirst: vi.fn(),
  abrir: vi.fn(),
  listar: vi.fn(),
  iniciarCopia: vi.fn(),
  iniciarRestauracion: vi.fn(),
  hay: vi.fn(),
  cargar: vi.fn(),
  proyectoFind: vi.fn(),
  proyectoUpdate: vi.fn(),
  elementoFindMany: vi.fn(),
  elementoUpsert: vi.fn(),
  detectar: vi.fn(),
  copiarProyecto: vi.fn(),
  listarProyectos: vi.fn(),
  restaurarProyecto: vi.fn(),
  cancelarOp: vi.fn(),
  restaurando: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionBackup: {
      findUnique: m.configFind,
      upsert: m.configUpsert,
      update: m.configUpdate,
    },
    credencial: { findUnique: m.credFind },
    backup: { findMany: m.backupFindMany, findFirst: m.backupFindFirst },
    proyecto: { findUnique: m.proyectoFind, update: m.proyectoUpdate },
    elementoBackup: { findMany: m.elementoFindMany, upsert: m.elementoUpsert },
  },
}));
vi.mock("@/lib/crypto", () => ({
  cifrar: (v: string) => ({
    valorCifrado: `cif(${v})`,
    iv: "iv",
    authTag: "tag",
  }),
  descifrar: (v: string) => v.replace(/^cif\((.*)\)$/, "$1"),
}));
vi.mock("@/lib/backups/kit", async (o) => ({
  ...(await o<typeof import("@/lib/backups/kit")>()),
  generarClave: () => "CLAVE-NUEVA",
}));
vi.mock("@/lib/backups/restic", async (o) => ({
  ...(await o<typeof import("@/lib/backups/restic")>()),
  abrirOInicializar: m.abrir,
  listarSnapshots: m.listar,
  listarSnapshotsProyectos: m.listarProyectos,
}));
vi.mock("@/lib/backups/deteccion", () => ({ detectarProyecto: m.detectar }));
vi.mock("@/lib/backups/restaurando", async (o) => ({
  ...(await o<typeof import("@/lib/backups/restaurando")>()),
  estaRestaurando: m.restaurando,
}));
vi.mock("@/lib/backups/restaurarProyecto", async (o) => ({
  ...(await o<typeof import("@/lib/backups/restaurarProyecto")>()),
  iniciarRestauracionProyecto: m.restaurarProyecto,
}));
vi.mock("@/lib/backups/configuracion", async (o) => ({
  ...(await o<typeof import("@/lib/backups/configuracion")>()),
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: unknown, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("@/lib/backups/copia", () => ({ iniciarCopia: m.iniciarCopia }));
vi.mock("@/lib/backups/ciclo", async (o) => ({
  ...(await o<typeof import("@/lib/backups/ciclo")>()),
  iniciarCopiaProyecto: m.copiarProyecto,
}));
vi.mock("@/lib/backups/restaurar", () => ({
  iniciarRestauracion: m.iniciarRestauracion,
}));
vi.mock("@/lib/backups/operacion", async (o) => ({
  ...(await o<typeof import("@/lib/backups/operacion")>()),
  hayOperacionEnCurso: m.hay,
  cancelarOperacion: m.cancelarOp,
}));

import { auth } from "@/lib/auth";
import { BackupsNoConfigurados } from "@/lib/backups/configuracion";
import { NadaQueCopiar } from "@/lib/backups/ciclo";
import { OperacionEnCurso } from "@/lib/backups/operacion";
import { ProyectoRestaurando } from "@/lib/backups/restaurando";
import {
  DeployEnCurso,
  RestauracionRechazada,
} from "@/lib/backups/restaurarProyecto";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory, createContext } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
let ctx: Awaited<ReturnType<typeof createContext>>;
const caller = () => createCaller(ctx);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
    expires: "2099-01-01",
  } as never);
  ctx = await createContext();
  m.hay.mockReturnValue(false);
  m.backupFindFirst.mockResolvedValue(null);
});

const s3Input = {
  tipo: "s3" as const,
  endpoint: "https://s3.ejemplo.com",
  bucket: "mi-bucket",
  accessKeyId: "AK",
  secretKey: "SK",
};

describe("backups.guardarDestino", () => {
  it("genera la clave, inicializa el repositorio y guarda todo cifrado", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockResolvedValue("inicializado");
    const res = await caller().backups.guardarDestino(s3Input);
    expect(res).toEqual({ repositorio: "inicializado" });
    const datos = m.configUpsert.mock.calls[0]![0].create;
    expect(datos).toMatchObject({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.ejemplo.com",
      s3Bucket: "mi-bucket",
      s3SecretKeyCifrada: "cif(SK)",
      claveCifrada: "cif(CLAVE-NUEVA)",
      repositorioInicializadoEn: expect.any(Date),
      claveConfirmadaEn: null,
    });
  });

  it("con clave de un repositorio existente la da por confirmada", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockResolvedValue("existente");
    await caller().backups.guardarDestino({
      ...s3Input,
      clave: "CLAVE-DEL-KIT-0123456789",
    });
    expect(m.configUpsert.mock.calls[0]![0].create).toMatchObject({
      claveCifrada: "cif(CLAVE-DEL-KIT-0123456789)",
      claveConfirmadaEn: expect.any(Date),
    });
  });

  it("si la clave no abre el repositorio no guarda nada", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockRejectedValue(
      new Error("La clave no abre el repositorio existente"),
    );
    await expect(
      caller().backups.guardarDestino(s3Input),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "La clave no abre el repositorio existente",
    });
    expect(m.configUpsert).not.toHaveBeenCalled();
  });

  it("secret key vacía mantiene la guardada", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      s3SecretKeyCifrada: "cif(VIEJA)",
      s3SecretKeyIv: "iv",
      s3SecretKeyTag: "tag",
    });
    m.abrir.mockResolvedValue("existente");
    await caller().backups.guardarDestino({ ...s3Input, secretKey: "" });
    expect(m.configUpsert.mock.calls[0]![0].update).toMatchObject({
      s3SecretKeyCifrada: "cif(VIEJA)",
    });
  });

  it("no permite cambiar una clave ya guardada", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
    });
    await expect(
      caller().backups.guardarDestino({
        ...s3Input,
        clave: "OTRA-CLAVE-0123456789",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "La clave de cifrado no se puede cambiar",
    });
  });

  it.each([
    ["endpoint sin https", { ...s3Input, endpoint: "http://s3.ejemplo.com" }],
    ["prefijo con ..", { ...s3Input, prefijo: "../otro" }],
    [
      "ruta SFTP relativa",
      {
        tipo: "sftp",
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "relativa",
        credencialId: "c1",
      },
    ],
    [
      "puerto fuera de rango",
      {
        tipo: "sftp",
        host: "h",
        puerto: 70000,
        usuario: "u",
        ruta: "/r",
        credencialId: "c1",
      },
    ],
  ])("valida la entrada: %s", async (_, input) => {
    await expect(
      caller().backups.guardarDestino(input as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("SFTP con credencial inexistente: NOT_FOUND", async () => {
    m.configFind.mockResolvedValue(null);
    m.credFind.mockResolvedValue(null);
    await expect(
      caller().backups.guardarDestino({
        tipo: "sftp",
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "/r",
        credencialId: "c1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("kit y clave", () => {
  it("obtenerKit devuelve el kit mientras no está confirmada", async () => {
    m.configFind.mockResolvedValue({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.x",
      s3Bucket: "b",
      s3Prefijo: null,
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: null,
    });
    const { kit } = await caller().backups.obtenerKit();
    expect(kit).toContain("Clave:        K");
    expect(kit).toContain("s3:https://s3.x/b");
  });
  it("después de confirmar: FORBIDDEN", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: new Date(),
    });
    await expect(caller().backups.obtenerKit()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("sin clave: NOT_FOUND", async () => {
    m.configFind.mockResolvedValue(null);
    await expect(caller().backups.obtenerKit()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("programación y operaciones", () => {
  it("habilitar exige repositorio inicializado y clave confirmada", async () => {
    m.configFind.mockResolvedValue({
      repositorioInicializadoEn: new Date(),
      claveConfirmadaEn: null,
    });
    await expect(
      caller().backups.guardarProgramacion({ habilitado: true, hora: 3 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("hora fuera de 0-23: BAD_REQUEST", async () => {
    await expect(
      caller().backups.guardarProgramacion({ habilitado: false, hora: 24 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("lanzarCopia con otra en curso: CONFLICT", async () => {
    m.iniciarCopia.mockRejectedValue(new OperacionEnCurso());
    await expect(caller().backups.lanzarCopia()).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("lanzarCopia sin configurar: PRECONDITION_FAILED", async () => {
    m.iniciarCopia.mockRejectedValue(
      new BackupsNoConfigurados("no hay destino"),
    );
    await expect(caller().backups.lanzarCopia()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("restaurar exige escribir RESTAURAR y un id hexadecimal", async () => {
    await expect(
      caller().backups.restaurar({
        snapshotId: "abc123",
        confirmacion: "restaurar" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().backups.restaurar({
        snapshotId: "abc; rm",
        confirmacion: "RESTAURAR",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    m.iniciarRestauracion.mockResolvedValue({ id: "r1" });
    expect(
      await caller().backups.restaurar({
        snapshotId: "abc12345",
        confirmacion: "RESTAURAR",
      }),
    ).toEqual({ id: "r1" });
  });
  it("historial convierte bytesAnadidos de BigInt a number", async () => {
    m.backupFindMany.mockResolvedValue([
      { id: "b1", bytesAnadidos: BigInt(4096) },
    ]);
    expect((await caller().backups.historial())[0]!.bytesAnadidos).toBe(4096);
    expect(m.backupFindMany).toHaveBeenCalledWith({
      orderBy: { iniciadoEn: "desc" },
      take: 30,
    });
  });
});

describe("backups.obtenerConfiguracion", () => {
  it("sin fila: valores por defecto y sin próxima copia", async () => {
    m.configFind.mockResolvedValue(null);
    expect(await caller().backups.obtenerConfiguracion()).toEqual({
      habilitado: false,
      hora: 3,
      tipoDestino: null,
      s3: {
        endpoint: null,
        bucket: null,
        region: null,
        prefijo: null,
        accessKeyId: null,
        tieneSecretKey: false,
      },
      sftp: {
        host: null,
        puerto: 22,
        usuario: null,
        ruta: null,
        credencialId: null,
      },
      tieneClave: false,
      claveConfirmada: false,
      repositorioInicializado: false,
      proximaCopia: null,
      enCurso: false,
    });
  });

  it("habilitado: secretos solo como indicador y próxima copia calculada", async () => {
    m.hay.mockReturnValue(true);
    m.configFind.mockResolvedValue({
      habilitado: true,
      hora: 4,
      tipoDestino: "sftp",
      s3Endpoint: null,
      s3Bucket: null,
      s3Region: null,
      s3Prefijo: null,
      s3AccessKeyId: null,
      s3SecretKeyCifrada: "cif(SK)",
      sftpHost: "h",
      sftpPuerto: 2222,
      sftpUsuario: "u",
      sftpRuta: "/r",
      sftpCredencialId: "c1",
      claveCifrada: "cif(K)",
      claveConfirmadaEn: new Date(),
      repositorioInicializadoEn: new Date(),
    });
    m.backupFindFirst.mockResolvedValue({ iniciadoEn: new Date() });
    const c = await caller().backups.obtenerConfiguracion();
    expect(c).toMatchObject({
      habilitado: true,
      hora: 4,
      tipoDestino: "sftp",
      s3: { tieneSecretKey: true },
      sftp: { host: "h", puerto: 2222, usuario: "u", credencialId: "c1" },
      tieneClave: true,
      claveConfirmada: true,
      repositorioInicializado: true,
      enCurso: true,
    });
    expect(c.proximaCopia).toBeInstanceOf(Date);
    expect(JSON.stringify(c)).not.toContain("cif(");
  });

  it("habilitado y sin copias programadas previas: también calcula la próxima", async () => {
    m.configFind.mockResolvedValue({ habilitado: true, hora: 3 });
    const c = await caller().backups.obtenerConfiguracion();
    expect(c.proximaCopia).toBeInstanceOf(Date);
  });
});

describe("backups.guardarDestino — más casos", () => {
  const sftpInput = {
    tipo: "sftp" as const,
    host: "backup.ejemplo.com",
    puerto: 2222,
    usuario: "copias",
    ruta: "/srv/vicalba",
    credencialId: "c1",
  };

  it("SFTP: usa la clave privada de la credencial y guarda el destino", async () => {
    m.configFind.mockResolvedValue(null);
    m.credFind.mockResolvedValue({
      clavePrivadaCifrada: "cif(PK)",
      iv: "iv",
      authTag: "tag",
    });
    m.abrir.mockResolvedValue("inicializado");
    await caller().backups.guardarDestino(sftpInput);
    expect(m.configUpsert.mock.calls[0]![0].create).toMatchObject({
      tipoDestino: "sftp",
      sftpHost: "backup.ejemplo.com",
      sftpPuerto: 2222,
      sftpUsuario: "copias",
      sftpRuta: "/srv/vicalba",
      sftpCredencialId: "c1",
      s3Endpoint: null,
      s3SecretKeyCifrada: null,
    });
  });

  it("S3 con región y prefijo en el mismo repositorio: conserva la confirmación", async () => {
    const confirmada = new Date("2026-10-01T00:00:00Z");
    m.configFind.mockResolvedValue({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.ejemplo.com",
      s3Bucket: "mi-bucket",
      s3Prefijo: "vicalba",
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: confirmada,
    });
    m.abrir.mockResolvedValue("existente");
    await caller().backups.guardarDestino({
      ...s3Input,
      region: "eu-central-003",
      prefijo: "vicalba",
    });
    expect(m.configUpsert.mock.calls[0]![0].update).toMatchObject({
      s3Region: "eu-central-003",
      s3Prefijo: "vicalba",
      claveCifrada: "cif(K)",
      claveConfirmadaEn: confirmada,
    });
  });

  it("si cambia el repositorio, vuelve a pedir que se guarde el kit", async () => {
    m.configFind.mockResolvedValue({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.ejemplo.com",
      s3Bucket: "mi-bucket",
      s3Prefijo: null,
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: new Date("2026-10-01T00:00:00Z"),
    });
    m.credFind.mockResolvedValue({
      clavePrivadaCifrada: "cif(PK)",
      iv: "iv",
      authTag: "tag",
    });
    m.abrir.mockResolvedValue("inicializado");
    await caller().backups.guardarDestino({
      tipo: "sftp",
      host: "h",
      puerto: 22,
      usuario: "u",
      ruta: "/r",
      credencialId: "c1",
    });
    expect(m.configUpsert.mock.calls[0]![0].update).toMatchObject({
      claveCifrada: "cif(K)",
      claveConfirmadaEn: null,
    });
  });

  it("S3 sin secret key nueva ni guardada: BAD_REQUEST", async () => {
    m.configFind.mockResolvedValue(null);
    await expect(
      caller().backups.guardarDestino({ ...s3Input, secretKey: undefined }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Falta la secret key",
    });
    expect(m.abrir).not.toHaveBeenCalled();
  });

  it("un fallo de restic que no es Error también se explica", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockRejectedValue("sin conexión");
    await expect(
      caller().backups.guardarDestino(s3Input),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "sin conexión" });
  });

  it("si el destino no responde, corta a los 30 s y dice por qué", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockRejectedValue(
      cancelado(
        "Stat(<config/>) returned error, retrying after 668ms: Stat: Access Denied",
      ),
    );
    await expect(
      caller().backups.guardarDestino(s3Input),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El destino no responde (30 s): Stat: Access Denied",
    });
    expect(m.abrir.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
    expect(m.configUpsert).not.toHaveBeenCalled();
  });
});

describe("backups.copias — destino que no responde", () => {
  it("corta a los 30 s con TIMEOUT", async () => {
    m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "s3" } });
    m.listar.mockRejectedValue(cancelado());
    await expect(caller().backups.copias()).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "El destino no responde (30 s)",
    });
    expect(m.listar.mock.calls[0]![0].signal).toBeInstanceOf(AbortSignal);
  });
});

function cancelado(stderr?: string): Error {
  const err = new Error(
    `restic cancelado${
      stderr
        ? `:
${stderr}`
        : ""
    }`,
  );
  err.name = "AbortError";
  return err;
}

describe("backups — resto de procedures", () => {
  it("obtenerKit con destino SFTP", async () => {
    m.configFind.mockResolvedValue({
      tipoDestino: "sftp",
      sftpHost: "h",
      sftpPuerto: 22,
      sftpUsuario: "u",
      sftpRuta: "/r",
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: null,
    });
    const { kit } = await caller().backups.obtenerKit();
    expect(kit).toContain("sftp:u@h:/r");
  });

  it("obtenerKit con un destino incompleto no falla", async () => {
    m.configFind.mockResolvedValue({
      tipoDestino: "s3",
      s3Endpoint: null,
      s3Bucket: null,
      s3Prefijo: null,
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: null,
    });
    expect((await caller().backups.obtenerKit()).kit).toContain("Clave:");
    m.configFind.mockResolvedValue({
      tipoDestino: "sftp",
      sftpHost: null,
      sftpPuerto: 22,
      sftpUsuario: null,
      sftpRuta: null,
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: null,
    });
    expect((await caller().backups.obtenerKit()).kit).toContain("Clave:");
  });

  it("confirmarClave marca la fecha", async () => {
    await caller().backups.confirmarClave();
    expect(m.configUpdate).toHaveBeenCalledWith({
      where: { id: "default" },
      data: { claveConfirmadaEn: expect.any(Date) },
    });
  });

  it("guardarProgramacion guarda habilitado y hora", async () => {
    m.configFind.mockResolvedValue({
      repositorioInicializadoEn: new Date(),
      claveConfirmadaEn: new Date(),
    });
    await caller().backups.guardarProgramacion({ habilitado: true, hora: 5 });
    expect(m.configUpsert).toHaveBeenCalledWith({
      where: { id: "default" },
      create: { id: "default", habilitado: true, hora: 5 },
      update: { habilitado: true, hora: 5 },
    });
  });

  it("guardarProgramacion sin configuración: no se puede habilitar", async () => {
    m.configFind.mockResolvedValue(null);
    await expect(
      caller().backups.guardarProgramacion({ habilitado: true, hora: 3 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("lanzarCopia devuelve el id y propaga errores inesperados", async () => {
    m.iniciarCopia.mockResolvedValueOnce({ id: "b1" });
    expect(await caller().backups.lanzarCopia()).toEqual({ id: "b1" });
    m.iniciarCopia.mockRejectedValueOnce(new Error("BD caída"));
    await expect(caller().backups.lanzarCopia()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("restaurar con otra operación en curso: CONFLICT", async () => {
    m.iniciarRestauracion.mockRejectedValue(new OperacionEnCurso());
    await expect(
      caller().backups.restaurar({
        snapshotId: "abc12345",
        confirmacion: "RESTAURAR",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("historial deja null el tamaño de las ejecuciones sin snapshot", async () => {
    m.backupFindMany.mockResolvedValue([{ id: "b1", bytesAnadidos: null }]);
    expect((await caller().backups.historial())[0]!.bytesAnadidos).toBeNull();
  });

  it("copias lista los snapshots del destino", async () => {
    m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "s3" } });
    m.listar.mockResolvedValue([{ id: "s1", fecha: new Date(), bytes: 10 }]);
    expect(await caller().backups.copias()).toHaveLength(1);
  });

  it("copias sin configurar: PRECONDITION_FAILED", async () => {
    m.cargar.mockRejectedValue(new BackupsNoConfigurados("no hay destino"));
    await expect(caller().backups.copias()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("resumen: última correcta y resultado de la última copia", async () => {
    const fecha = new Date("2026-10-14T01:00:00Z");
    m.configFind.mockResolvedValue({ habilitado: true });
    m.backupFindFirst
      .mockResolvedValueOnce({ iniciadoEn: fecha })
      .mockResolvedValueOnce({ resultado: "error" });
    expect(await caller().backups.resumen()).toEqual({
      habilitado: true,
      ultimaCorrecta: fecha,
      ultimoResultado: "error",
    });
  });

  it("resumen ignora las copias de Proyectos", async () => {
    m.configFind.mockResolvedValue({ habilitado: true });
    m.backupFindFirst.mockResolvedValue(null);
    await caller().backups.resumen();
    expect(m.backupFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { operacion: "copia", resultado: "exito", proyectoId: null },
      }),
    );
    expect(m.backupFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { operacion: "copia", proyectoId: null },
      }),
    );
  });

  it("historial devuelve proyectoNombre", async () => {
    m.backupFindMany.mockResolvedValue([
      { id: "b1", bytesAnadidos: null, proyectoNombre: "acme/web" },
    ]);
    expect((await caller().backups.historial())[0]!.proyectoNombre).toBe(
      "acme/web",
    );
  });

  it("resumen sin configuración ni copias", async () => {
    m.configFind.mockResolvedValue(null);
    expect(await caller().backups.resumen()).toEqual({
      habilitado: false,
      ultimaCorrecta: null,
      ultimoResultado: null,
    });
  });
});

describe("backups por Proyecto", () => {
  const COPIA = "c".repeat(25);
  const bd = {
    tipo: "bd",
    clave: "bd:app",
    servicio: "db",
    motor: "postgres",
    contenedorId: "x",
    enMarcha: true,
  };
  const datos = {
    tipo: "datos",
    clave: "datos:./data",
    origen: "/o",
    montaje: "bind",
    restaurable: true,
  };

  beforeEach(() => {
    m.proyectoFind.mockResolvedValue({
      id: "p1",
      nombre: "web",
      backupsHabilitados: true,
      cliente: { slug: "acme" },
    });
    m.restaurando.mockReturnValue(false);
  });

  describe("elementosProyecto", () => {
    it("marca incluidos salvo los desmarcados y devuelve la última copia", async () => {
      m.detectar.mockResolvedValue({
        valida: true,
        elementos: [bd, datos],
        noCopiados: [{ origen: "/x", motivo: "Fuera del Proyecto" }],
      });
      m.elementoFindMany.mockResolvedValue([
        { clave: "datos:./data", incluido: false },
      ]);
      const iniciadoEn = new Date("2026-10-01");
      m.backupFindFirst.mockResolvedValue({ iniciadoEn, resultado: "exito" });
      m.hay.mockReturnValue(true);
      m.restaurando.mockReturnValue(true);
      const res = await caller().backups.elementosProyecto({
        proyectoId: "p1",
      });
      expect(m.detectar).toHaveBeenCalledWith("acme", "web");
      expect(res).toEqual({
        habilitado: true,
        valida: true,
        elementos: [
          { ...bd, incluido: true },
          { ...datos, incluido: false },
        ],
        noCopiados: [{ origen: "/x", motivo: "Fuera del Proyecto" }],
        ultima: { iniciadoEn, resultado: "exito" },
        restaurando: true,
        enCurso: true,
      });
    });

    it("sin copias previas devuelve ultima null", async () => {
      m.detectar.mockResolvedValue({
        valida: false,
        elementos: [],
        noCopiados: [],
      });
      m.elementoFindMany.mockResolvedValue([]);
      const res = await caller().backups.elementosProyecto({
        proyectoId: "p1",
      });
      expect(res.ultima).toBeNull();
    });

    it("Proyecto inexistente: NOT_FOUND", async () => {
      m.proyectoFind.mockResolvedValue(null);
      await expect(
        caller().backups.elementosProyecto({ proyectoId: "nada" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("marcarElemento", () => {
    it("hace upsert del elemento", async () => {
      await caller().backups.marcarElemento({
        proyectoId: "p1",
        clave: "bd:app",
        incluido: false,
      });
      expect(m.elementoUpsert).toHaveBeenCalledWith({
        where: { proyectoId_clave: { proyectoId: "p1", clave: "bd:app" } },
        create: { proyectoId: "p1", clave: "bd:app", incluido: false },
        update: { incluido: false },
      });
    });

    it("Proyecto inexistente: NOT_FOUND", async () => {
      m.proyectoFind.mockResolvedValue(null);
      await expect(
        caller().backups.marcarElemento({
          proyectoId: "x",
          clave: "bd:app",
          incluido: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(m.elementoUpsert).not.toHaveBeenCalled();
    });
  });

  describe("habilitarProyecto", () => {
    it("actualiza backupsHabilitados", async () => {
      await caller().backups.habilitarProyecto({
        proyectoId: "p1",
        habilitado: false,
      });
      expect(m.proyectoUpdate).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { backupsHabilitados: false },
      });
    });

    it("Proyecto inexistente: NOT_FOUND", async () => {
      m.proyectoFind.mockResolvedValue(null);
      await expect(
        caller().backups.habilitarProyecto({
          proyectoId: "x",
          habilitado: true,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("copiarProyecto", () => {
    it("lanza la copia", async () => {
      m.copiarProyecto.mockResolvedValue({ id: "b1" });
      expect(
        await caller().backups.copiarProyecto({ proyectoId: "p1" }),
      ).toEqual({ id: "b1" });
      expect(m.copiarProyecto).toHaveBeenCalledWith("p1");
    });

    it("NadaQueCopiar: BAD_REQUEST", async () => {
      m.copiarProyecto.mockRejectedValue(new NadaQueCopiar("Nada"));
      await expect(
        caller().backups.copiarProyecto({ proyectoId: "p1" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Nada" });
    });

    it("OperacionEnCurso: CONFLICT", async () => {
      m.copiarProyecto.mockRejectedValue(new OperacionEnCurso());
      await expect(
        caller().backups.copiarProyecto({ proyectoId: "p1" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("copiasProyecto", () => {
    const snap = (
      id: string,
      backupId: string,
      ruta: string,
      fecha: string,
      bytes: number | null,
      origen = "manual",
    ) => ({
      id,
      backupId,
      ruta,
      fecha: new Date(fecha),
      bytes,
      origen,
      proyectoId: "p1",
      hashElemento: "h",
    });

    it("agrupa por copia, suma bytes y ordena por fecha desc", async () => {
      m.cargar.mockResolvedValue({});
      m.listarProyectos.mockResolvedValue([
        snap("s1", "vieja", "/bd/app/app.sql", "2026-10-01T10:00:00Z", 10),
        snap("s2", "nueva", "/bd/app/app.sql", "2026-10-02T10:00:00Z", 100),
        snap(
          "s3",
          "nueva",
          "/datos/datos%3A.%2Fdata.tar",
          "2026-10-02T10:05:00Z",
          50,
        ),
        snap(
          "s4",
          "nueva",
          "/datos/datos%3A.panel%2Fx.tar",
          "2026-10-02T10:01:00Z",
          null,
        ),
        snap("s5", "vieja", "/bd/app/app.sql", "2026-10-01T10:01:00Z", null),
        snap("s6", "sinbytes", "/bd/app/app.sql", "2026-09-01T10:00:00Z", null),
      ]);
      const res = await caller().backups.copiasProyecto({ proyectoId: "p1" });
      expect(m.listarProyectos).toHaveBeenCalledWith(expect.anything(), "p1");
      expect(res.map((c) => c.id)).toEqual(["nueva", "vieja", "sinbytes"]);
      expect(res[0]).toEqual({
        id: "nueva",
        fecha: new Date("2026-10-02T10:05:00Z"),
        origen: "manual",
        bytes: 150,
        elementos: [
          { clave: "bd:app", restaurable: true },
          { clave: "datos:./data", restaurable: true },
          { clave: "datos:.panel/x", restaurable: false },
        ],
      });
      expect(res[1].bytes).toBe(10);
      expect(res[1].elementos).toHaveLength(1);
      expect(res[2].bytes).toBeNull();
    });

    it("destino sin respuesta: TIMEOUT", async () => {
      m.cargar.mockResolvedValue({});
      const err = new Error("x");
      err.name = "AbortError";
      m.listarProyectos.mockRejectedValue(err);
      await expect(
        caller().backups.copiasProyecto({ proyectoId: "p1" }),
      ).rejects.toMatchObject({ code: "TIMEOUT" });
    });
  });

  describe("restaurarProyecto", () => {
    const entrada = {
      proyectoId: "p1",
      copiaId: COPIA,
      claves: ["bd:app"],
      confirmacion: "web",
    };

    it("lanza la restauración", async () => {
      m.restaurarProyecto.mockResolvedValue({ id: "r1" });
      expect(await caller().backups.restaurarProyecto(entrada)).toEqual({
        id: "r1",
      });
      expect(m.restaurarProyecto).toHaveBeenCalledWith({
        proyectoId: "p1",
        copiaId: COPIA,
        claves: ["bd:app"],
      });
    });

    it("confirmación distinta del nombre: BAD_REQUEST", async () => {
      await expect(
        caller().backups.restaurarProyecto({
          ...entrada,
          confirmacion: "otro",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(m.restaurarProyecto).not.toHaveBeenCalled();
    });

    it("Proyecto inexistente: NOT_FOUND", async () => {
      m.proyectoFind.mockResolvedValue(null);
      await expect(
        caller().backups.restaurarProyecto(entrada),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("copiaId con formato inválido lo rechaza Zod", async () => {
      await expect(
        caller().backups.restaurarProyecto({ ...entrada, copiaId: "../x" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("sin claves lo rechaza Zod", async () => {
      await expect(
        caller().backups.restaurarProyecto({ ...entrada, claves: [] }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it.each([
      ["RestauracionRechazada", new RestauracionRechazada("No"), "BAD_REQUEST"],
      ["DeployEnCurso", new DeployEnCurso(), "CONFLICT"],
      ["ProyectoRestaurando", new ProyectoRestaurando(), "CONFLICT"],
      ["OperacionEnCurso", new OperacionEnCurso(), "CONFLICT"],
    ])("%s se traduce a %s", async (_n, err, code) => {
      m.restaurarProyecto.mockRejectedValue(err);
      await expect(
        caller().backups.restaurarProyecto(entrada),
      ).rejects.toMatchObject({ code });
    });
  });

  describe("cancelar y enCurso", () => {
    it("cancela con el nombre del usuario", async () => {
      m.cancelarOp.mockReturnValue(true);
      await caller().backups.cancelar();
      expect(m.cancelarOp).toHaveBeenCalledWith("Cancelado por Admin");
    });

    it("usa el email si el usuario no tiene nombre", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "u1", email: "a@b.c" },
        expires: "2099-01-01",
      } as never);
      ctx = await createContext();
      m.cancelarOp.mockReturnValue(true);
      await caller().backups.cancelar();
      expect(m.cancelarOp).toHaveBeenCalledWith("Cancelado por a@b.c");
    });

    it("sin nombre ni email usa un texto genérico", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "u1" },
        expires: "2099-01-01",
      } as never);
      ctx = await createContext();
      m.cancelarOp.mockReturnValue(true);
      await caller().backups.cancelar();
      expect(m.cancelarOp).toHaveBeenCalledWith("Cancelado por un usuario");
    });

    it("sin operación en curso: NOT_FOUND", async () => {
      m.cancelarOp.mockReturnValue(false);
      await expect(caller().backups.cancelar()).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("enCurso refleja el candado", async () => {
      m.hay.mockReturnValue(true);
      expect(await caller().backups.enCurso()).toBe(true);
    });
  });
});
