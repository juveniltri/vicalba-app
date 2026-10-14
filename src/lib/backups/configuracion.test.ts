import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockEjecutarFs } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockEjecutarFs: {
    writeFile: vi.fn(),
    rm: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: { REPOS_DIR: "/var/vicalba/repos", ENCRYPTION_KEY: "0".repeat(64) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { configuracionBackup: { findUnique: mockFindUnique } },
}));
vi.mock("@/lib/crypto", () => ({ descifrar: (v: string) => `claro(${v})` }));
vi.mock("node:fs/promises", () => mockEjecutarFs);

import {
  BackupsNoConfigurados,
  cargarConfigResuelta,
  conRestic,
  RUTAS_BACKUP,
} from "./configuracion";

const base = {
  habilitado: true,
  hora: 3,
  claveCifrada: "k",
  claveIv: "i",
  claveTag: "t",
  claveConfirmadaEn: new Date(),
  repositorioInicializadoEn: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEjecutarFs.mkdtemp.mockResolvedValue("/tmp/vicalba-ssh-1");
});

describe("cargarConfigResuelta", () => {
  it("S3: descifra la secret key y la clave", async () => {
    mockFindUnique.mockResolvedValue({
      ...base,
      tipoDestino: "s3",
      s3Endpoint: "https://s3.x",
      s3Bucket: "b",
      s3Region: null,
      s3Prefijo: "p",
      s3AccessKeyId: "AK",
      s3SecretKeyCifrada: "sk",
      s3SecretKeyIv: "i",
      s3SecretKeyTag: "t",
    });
    expect(await cargarConfigResuelta()).toEqual({
      clave: "claro(k)",
      destino: {
        tipo: "s3",
        endpoint: "https://s3.x",
        bucket: "b",
        region: null,
        prefijo: "p",
        accessKeyId: "AK",
        secretKey: "claro(sk)",
      },
    });
  });

  it("SFTP: descifra la clave privada de la credencial", async () => {
    mockFindUnique.mockResolvedValue({
      ...base,
      tipoDestino: "sftp",
      sftpHost: "h",
      sftpPuerto: 22,
      sftpUsuario: "u",
      sftpRuta: "/r",
      sftpCredencial: { clavePrivadaCifrada: "pk", iv: "i", authTag: "t" },
    });
    const c = await cargarConfigResuelta();
    expect(c.destino).toEqual({
      tipo: "sftp",
      host: "h",
      puerto: 22,
      usuario: "u",
      ruta: "/r",
      clavePrivada: "claro(pk)",
    });
  });

  it.each([
    ["sin fila", null],
    ["sin destino", { ...base, tipoDestino: null }],
    ["sin clave", { ...base, tipoDestino: "s3", claveCifrada: null }],
    ["S3 incompleto", { ...base, tipoDestino: "s3", s3Endpoint: null }],
    [
      "SFTP sin credencial",
      {
        ...base,
        tipoDestino: "sftp",
        sftpHost: "h",
        sftpUsuario: "u",
        sftpRuta: "/r",
        sftpCredencial: null,
      },
    ],
  ])("lanza BackupsNoConfigurados: %s", async (_, fila) => {
    mockFindUnique.mockResolvedValue(fila);
    await expect(cargarConfigResuelta()).rejects.toBeInstanceOf(
      BackupsNoConfigurados,
    );
  });
});

describe("conRestic", () => {
  it("SFTP: escribe la clave normalizada con permisos 600 y la borra aunque falle", async () => {
    const config = {
      clave: "c",
      destino: {
        tipo: "sftp" as const,
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "/r",
        clavePrivada: "KEY\r\n",
      },
    };
    await expect(
      conRestic(config, undefined, async () => {
        throw new Error("fallo");
      }),
    ).rejects.toThrow("fallo");
    expect(mockEjecutarFs.writeFile).toHaveBeenCalledWith(
      "/tmp/vicalba-ssh-1/clave",
      "KEY\n",
      { mode: 0o600 },
    );
    expect(mockEjecutarFs.rm).toHaveBeenCalledWith("/tmp/vicalba-ssh-1", {
      recursive: true,
      force: true,
    });
  });

  it("S3: no escribe ninguna clave y pasa el entorno a la función", async () => {
    const config = {
      clave: "c",
      destino: {
        tipo: "s3" as const,
        endpoint: "https://s3.x",
        bucket: "b",
        region: null,
        prefijo: null,
        accessKeyId: "a",
        secretKey: "s",
      },
    };
    const r = await conRestic(
      config,
      undefined,
      async (restic) => restic.env.RESTIC_CACHE_DIR,
    );
    expect(r).toBe(RUTAS_BACKUP.cacheDir);
    expect(mockEjecutarFs.writeFile).not.toHaveBeenCalled();
    expect(mockEjecutarFs.mkdir).toHaveBeenCalledWith(RUTAS_BACKUP.base, {
      recursive: true,
    });
  });
});
