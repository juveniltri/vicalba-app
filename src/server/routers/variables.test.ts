import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/docker/deploy", () => ({
  deployProyecto: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/docker/proyectos", () => ({
  iniciarProyecto: vi.fn(),
  detenerProyecto: vi.fn(),
  restartProyecto: vi.fn(),
  DockerError: class DockerError extends Error {},
}));
vi.mock("@/lib/docker/networks", () => ({
  asegurarRedCliente: vi.fn(),
  eliminarRedCliente: vi.fn(),
}));
vi.mock("@/lib/traefik/config", () => ({
  generarConfigTraefik: vi.fn(),
  escribirConfigTraefik: vi.fn(),
  eliminarConfigTraefik: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    variableEntorno: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/crypto", () => ({
  cifrar: vi.fn().mockReturnValue({
    valorCifrado: "cifrado-base64",
    iv: "iv-hex",
    authTag: "tag-hex",
  }),
  descifrar: vi.fn().mockReturnValue("valor-descifrado"),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cifrar, descifrar } from "@/lib/crypto";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockVariable = {
  id: "v1",
  proyectoId: "p1",
  clave: "DATABASE_URL",
  valorCifrado: "cifrado-base64",
  iv: "iv-hex",
  authTag: "tag-hex",
  creadoEn: new Date(),
  actualizadoEn: new Date(),
};

describe("variables.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve solo id, clave y creadoEn — sin valores", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      { id: "v1", clave: "DATABASE_URL", creadoEn: new Date() },
    ] as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.listar({
      proyectoId: "p1",
    });
    expect(result).toHaveLength(1);
    expect(result[0].clave).toBe("DATABASE_URL");
    expect(result[0]).not.toHaveProperty("valorCifrado");
    expect(result[0]).not.toHaveProperty("iv");
  });

  it("lanza UNAUTHORIZED si no hay sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.listar({ proyectoId: "p1" }),
    ).rejects.toThrow();
  });
});

describe("variables.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("cifra el valor y guarda en BD", async () => {
    vi.mocked(prisma.variableEntorno.create).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.crear({
      proyectoId: "p1",
      clave: "DATABASE_URL",
      valor: "postgres://...",
    });
    expect(cifrar).toHaveBeenCalledWith("postgres://...");
    expect(prisma.variableEntorno.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clave: "DATABASE_URL",
          valorCifrado: "cifrado-base64",
          iv: "iv-hex",
          authTag: "tag-hex",
        }),
      }),
    );
  });

  it("rechaza clave vacía", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "",
        valor: "x",
      }),
    ).rejects.toThrow();
  });

  it("rechaza clave con caracteres inválidos (espacios)", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "MI CLAVE",
        valor: "x",
      }),
    ).rejects.toThrow();
  });

  it("lanza CONFLICT si la clave ya existe en el proyecto", async () => {
    vi.mocked(prisma.variableEntorno.create).mockRejectedValue({
      code: "P2002",
    });
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "DATABASE_URL",
        valor: "x",
      }),
    ).rejects.toThrow("ya existe");
  });
});

describe("variables.actualizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("genera nuevo IV y re-cifra el valor", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.update).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.actualizar({
      id: "v1",
      valor: "nuevo-valor",
    });
    expect(cifrar).toHaveBeenCalledWith("nuevo-valor");
    expect(prisma.variableEntorno.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1" },
        data: expect.objectContaining({ valorCifrado: "cifrado-base64" }),
      }),
    );
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.actualizar({ id: "no-existe", valor: "x" }),
    ).rejects.toThrow("no encontrada");
  });
});

describe("variables.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("elimina la variable existente", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.delete).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.eliminar({ id: "v1" });
    expect(prisma.variableEntorno.delete).toHaveBeenCalledWith({
      where: { id: "v1" },
    });
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.eliminar({ id: "no-existe" }),
    ).rejects.toThrow("no encontrada");
  });
});

describe("variables.revelar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("descifra y devuelve el valor en claro", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.revelar({ id: "v1" });
    expect(descifrar).toHaveBeenCalledWith(
      "cifrado-base64",
      "iv-hex",
      "tag-hex",
    );
    expect(result.valor).toBe("valor-descifrado");
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.revelar({ id: "no-existe" }),
    ).rejects.toThrow("no encontrada");
  });
});
