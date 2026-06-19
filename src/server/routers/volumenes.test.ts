import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/docker/proyectos", () => ({
  iniciarProyecto: vi.fn(),
  detenerProyecto: vi.fn(),
  restartProyecto: vi.fn(),
  DockerError: class DockerError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "DockerError";
    }
  },
}));
vi.mock("@/lib/docker/deploy", () => ({ deployProyecto: vi.fn() }));
vi.mock("@/lib/docker/deploys", () => ({ ejecutarDeploy: vi.fn() }));
vi.mock("@/lib/docker/networks", () => ({
  asegurarRedCliente: vi.fn(),
  eliminarRedCliente: vi.fn(),
}));
vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: vi.fn(),
  desconectarTraefikDeRed: vi.fn(),
}));
vi.mock("@/lib/traefik/config", () => ({
  generarConfigTraefik: vi.fn(),
  escribirConfigTraefik: vi.fn(),
  eliminarConfigTraefik: vi.fn(),
}));
vi.mock("@/lib/ssl/acme", () => ({ leerEstadoSSL: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  cifrar: vi
    .fn()
    .mockReturnValue({ valorCifrado: "x", iv: "iv", authTag: "t" }),
  descifrar: vi.fn().mockReturnValue("v"),
}));
vi.mock("@/lib/deploy-stream", () => ({
  getOrCreateDeployEmitter: vi.fn().mockReturnValue({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  }),
  clearDeployEmitter: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    volumen: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    proyecto: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    cliente: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    variableEntorno: { findMany: vi.fn() },
    credencialSSH: { findMany: vi.fn() },
    configuracionNotificacion: { findFirst: vi.fn() },
    deploy: { findMany: vi.fn() },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/env", () => ({
  env: {
    REPOS_DIR: "/var/vicalba/repos",
    NODE_ENV: "test",
    NEXTAUTH_URL: "http://localhost:3000",
    NEXTAUTH_SECRET: "test-secret",
    DATABASE_URL: "postgresql://test",
    ENCRYPTION_KEY: "0".repeat(64),
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
    TRAEFIK_CONTAINER_NAME: "traefik",
    ACME_EMAIL: "test@test.com",
    GITHUB_WEBHOOK_SECRET: "secret",
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { mkdir } from "node:fs/promises";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockProyecto = {
  id: "p1",
  nombre: "web-app",
  cliente: { slug: "acme" },
  clienteId: "cli1",
};

const mockVolumen = {
  id: "v1",
  proyectoId: "p1",
  nombre: "galeria",
  rutaContenedor: "/app/public/galeria",
  creadoEn: new Date(),
};

describe("volumenes.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve los volúmenes del proyecto", async () => {
    vi.mocked(prisma.volumen.findMany).mockResolvedValue([
      mockVolumen,
    ] as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).volumenes.listar({
      proyectoId: "p1",
    });

    expect(prisma.volumen.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { proyectoId: "p1" } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe("galeria");
  });

  it("lanza UNAUTHORIZED sin sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).volumenes.listar({ proyectoId: "p1" }),
    ).rejects.toThrow("UNAUTHORIZED");
  });
});

describe("volumenes.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
  });

  it("crea el directorio en el host y el registro en BD", async () => {
    vi.mocked(prisma.volumen.create).mockResolvedValue(mockVolumen as never);

    const ctx = await createContext();
    await createCaller(ctx).volumenes.crear({
      proyectoId: "p1",
      nombre: "galeria",
      rutaContenedor: "/app/public/galeria",
    });

    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining("/acme/web-app/volumes/galeria"),
      expect.objectContaining({ recursive: true }),
    );
    expect(prisma.volumen.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          proyectoId: "p1",
          nombre: "galeria",
          rutaContenedor: "/app/public/galeria",
        },
      }),
    );
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).volumenes.crear({
        proyectoId: "no-existe",
        nombre: "galeria",
        rutaContenedor: "/app/public/galeria",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lanza CONFLICT si el nombre de volumen ya existe en el proyecto (P2002)", async () => {
    vi.mocked(prisma.volumen.create).mockRejectedValue({ code: "P2002" });

    const ctx = await createContext();
    await expect(
      createCaller(ctx).volumenes.crear({
        proyectoId: "p1",
        nombre: "galeria",
        rutaContenedor: "/app/public/galeria",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rechaza nombres de volumen con caracteres inválidos", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).volumenes.crear({
        proyectoId: "p1",
        nombre: "../etc/passwd",
        rutaContenedor: "/app/data",
      }),
    ).rejects.toThrow();
  });
});

describe("volumenes.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
  });

  it("elimina el registro de BD (preserva ficheros en el host)", async () => {
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(
      mockVolumen as never,
    );
    vi.mocked(prisma.volumen.delete).mockResolvedValue(mockVolumen as never);

    const ctx = await createContext();
    await createCaller(ctx).volumenes.eliminar({ id: "v1" });

    expect(prisma.volumen.delete).toHaveBeenCalledWith({ where: { id: "v1" } });
  });

  it("lanza NOT_FOUND si el volumen no existe", async () => {
    vi.mocked(prisma.volumen.findUnique).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).volumenes.eliminar({ id: "no-existe" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
