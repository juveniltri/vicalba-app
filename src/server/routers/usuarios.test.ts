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

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    cliente: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    proyecto: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    variableEntorno: { findMany: vi.fn() },
    credencialSSH: { findMany: vi.fn() },
    configuracionNotificacion: { findFirst: vi.fn() },
    deploy: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockUser = {
  id: "u1",
  email: "admin@vicalba.local",
  nombre: "Admin",
  creadoEn: new Date(),
};

describe("usuarios.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve la lista de usuarios sin passwordHash", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([mockUser] as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).usuarios.listar();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ passwordHash: false }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("passwordHash");
  });

  it("lanza UNAUTHORIZED si no hay sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(createCaller(ctx).usuarios.listar()).rejects.toThrow(
      "UNAUTHORIZED",
    );
  });
});

describe("usuarios.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("hashea la contraseña y crea el usuario", async () => {
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);

    const ctx = await createContext();
    await createCaller(ctx).usuarios.crear({
      email: "nuevo@vicalba.local",
      nombre: "Nuevo",
      password: "secret123",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "nuevo@vicalba.local",
          nombre: "Nuevo",
          passwordHash: "hashed-password",
        }),
      }),
    );
  });

  it("lanza CONFLICT si el email ya existe (P2002)", async () => {
    vi.mocked(prisma.user.create).mockRejectedValue({ code: "P2002" });

    const ctx = await createContext();
    await expect(
      createCaller(ctx).usuarios.crear({
        email: "dup@vicalba.local",
        nombre: "Dup",
        password: "secret123",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rechaza contraseña de menos de 8 caracteres", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).usuarios.crear({
        email: "x@x.com",
        nombre: "X",
        password: "short",
      }),
    ).rejects.toThrow();
  });
});

describe("usuarios.actualizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("actualiza nombre y email del usuario", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      ...mockUser,
      nombre: "Nuevo Nombre",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).usuarios.actualizar({
      id: "u1",
      nombre: "Nuevo Nombre",
      email: "nuevo@vicalba.local",
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: expect.objectContaining({ nombre: "Nuevo Nombre" }),
      }),
    );
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("lanza NOT_FOUND si el usuario no existe", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).usuarios.actualizar({
        id: "no-existe",
        nombre: "X",
        email: "x@x.com",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("usuarios.cambiarPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("hashea la nueva contraseña y actualiza el usuario", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

    const ctx = await createContext();
    await createCaller(ctx).usuarios.cambiarPassword({
      id: "u1",
      password: "newpassword123",
    });

    expect(bcrypt.hash).toHaveBeenCalledWith("newpassword123", 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed-password" },
    });
  });

  it("lanza NOT_FOUND si el usuario no existe", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).usuarios.cambiarPassword({
        id: "no-existe",
        password: "newpassword123",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("usuarios.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("elimina el usuario", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.user.delete).mockResolvedValue(mockUser as never);

    const ctx = await createContext();
    await createCaller(ctx).usuarios.eliminar({ id: "u1" });

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });

  it("lanza NOT_FOUND si el usuario no existe", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).usuarios.eliminar({ id: "no-existe" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
