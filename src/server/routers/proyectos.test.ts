// src/server/routers/proyectos.test.ts
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: { findMany: vi.fn(), findUnique: vi.fn() },
    proyecto: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    variableEntorno: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    volumen: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    deploy: { findMany: vi.fn(), findUnique: vi.fn() },
    credencial: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
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

vi.mock("@/lib/traefik/config", () => ({
  generarConfigTraefik: vi.fn().mockReturnValue("yaml-content"),
  escribirConfigTraefik: vi.fn().mockResolvedValue(undefined),
  eliminarConfigTraefik: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/docker/deploys", () => ({
  ejecutarDeploy: vi.fn().mockResolvedValue({ resultado: "exito", output: "" }),
}));

vi.mock("@/lib/docker/deploy", () => ({
  prepararRepo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/docker/networks", () => ({
  asegurarRedCliente: vi.fn().mockResolvedValue(undefined),
  eliminarRedCliente: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/crypto", () => ({
  cifrar: vi.fn().mockReturnValue({
    valorCifrado: "cifrado-base64",
    iv: "iv-hex",
    authTag: "tag-hex",
  }),
  descifrar: vi.fn().mockReturnValue("valor-descifrado"),
}));

vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: vi.fn().mockResolvedValue(undefined),
  desconectarTraefikDeRed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ssl/acme", () => ({
  leerEstadoSSL: vi.fn().mockResolvedValue({ activo: true }),
}));

vi.mock("@/lib/notificaciones", () => ({
  enviarNotificacion: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  iniciarProyecto,
  detenerProyecto,
  restartProyecto,
  DockerError,
} from "@/lib/docker/proyectos";
import {
  generarConfigTraefik,
  escribirConfigTraefik,
  eliminarConfigTraefik,
} from "@/lib/traefik/config";
import { ejecutarDeploy } from "@/lib/docker/deploys";
import { prepararRepo } from "@/lib/docker/deploy";
import { readFile } from "node:fs/promises";
import { asegurarRedCliente, eliminarRedCliente } from "@/lib/docker/networks";
import { descifrar } from "@/lib/crypto";
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { leerEstadoSSL } from "@/lib/ssl/acme";
import { enviarNotificacion } from "@/lib/notificaciones";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockDbData = [
  {
    id: "c1",
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    creadoEn: new Date(),
    proyectos: [
      {
        id: "p1",
        nombre: "web-app",
        clienteId: "c1",
        estado: "running" as const,
        dominio: "app.cliente-uno.com",
        repositorioUrl: "https://github.com/org/web-app",
        rama: "main",
        autoDeployHabilitado: false,
        ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
        ultimoDeployRama: "main",
        tipo: "compose" as const,
        puerto: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ],
  },
];

describe("proyectos.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clientes with proyectos when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("cliente-uno");
    expect(result[0].proyectos[0].estado).toBe("running");
    expect(result[0].proyectos[0].dominio).toBe("app.cliente-uno.com");
  });

  it("listar does not include servicios in returned projects", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result[0].proyectos[0]).not.toHaveProperty("servicios");
  });

  it("maps ultimoDeployEn + rama to ultimoDeploy object", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result[0].proyectos[0].ultimoDeploy).not.toBeNull();
    expect(result[0].proyectos[0].ultimoDeploy?.rama).toBe("main");
    expect(result[0].proyectos[0].ultimoDeploy?.hace).toMatch(/hace \d+[mhd]/);
  });

  it("returns null ultimoDeploy when ultimoDeployEn is null", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      {
        ...mockDbData[0],
        proyectos: [
          {
            ...mockDbData[0].proyectos[0],
            ultimoDeployEn: null,
            ultimoDeployRama: null,
          },
        ],
      },
    ] as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result[0].proyectos[0].ultimoDeploy).toBeNull();
  });

  it("calls prisma without servicios include", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    await caller.proyectos.listar();

    const callArg = vi.mocked(prisma.cliente.findMany).mock
      .calls[0][0] as Record<string, unknown>;
    const proyectosInclude = (
      callArg?.include as { proyectos?: { include?: unknown } }
    )?.proyectos;
    expect(proyectosInclude).not.toHaveProperty("include");
  });

  it("includes sslActivo: true for projects with domain when cert exists", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);
    vi.mocked(leerEstadoSSL).mockResolvedValue({ activo: true });

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.listar();

    expect(result[0].proyectos[0].sslActivo).toBe(true);
    expect(leerEstadoSSL).toHaveBeenCalledWith("app.cliente-uno.com");
  });

  it("includes sslActivo: false for projects with domain but no cert", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);
    vi.mocked(leerEstadoSSL).mockResolvedValue({ activo: false });

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.listar();

    expect(result[0].proyectos[0].sslActivo).toBe(false);
  });

  it("includes sslActivo: null for projects without domain", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      {
        ...mockDbData[0],
        proyectos: [{ ...mockDbData[0].proyectos[0], dominio: null }],
      },
    ] as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.listar();

    expect(result[0].proyectos[0].sslActivo).toBeNull();
    expect(leerEstadoSSL).not.toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    const caller = createCaller(ctx);

    await expect(caller.proyectos.listar()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

const mockProyecto = {
  id: "p1",
  nombre: "web-app",
  clienteId: "c1",
  estado: "stopped" as const,
  dominio: "app.cliente-uno.com",
  repositorioUrl: "https://github.com/org/web-app",
  rama: "main",
  autoDeployHabilitado: false,
  ultimoDeployEn: null,
  ultimoDeployRama: null,
  tipo: "compose" as const,
  puerto: null,
  credencialId: null,
  creadoEn: new Date(),
  actualizadoEn: new Date(),
  cliente: {
    id: "c1",
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    creadoEn: new Date(),
  },
};

describe("proyectos.iniciar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("calls iniciarProyecto without servicios and updates estado to running", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "running",
    } as never);
    vi.mocked(iniciarProyecto).mockResolvedValue(undefined);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.iniciar({ id: "p1" });

    expect(iniciarProyecto).toHaveBeenCalledWith("cliente-uno", "web-app");
    expect(iniciarProyecto).toHaveBeenCalledTimes(1);
    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { estado: "running" },
    });
    expect(result.estado).toBe("running");
  });

  it("throws NOT_FOUND when project does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.iniciar({ id: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws INTERNAL_SERVER_ERROR when Docker returns DockerError", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(iniciarProyecto).mockRejectedValue(
      new DockerError("NOT_FOUND", "Container not found"),
    );

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.iniciar({ id: "p1" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rethrows non-DockerError from iniciarProyecto", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    const unexpected = new Error("Unexpected failure");
    vi.mocked(iniciarProyecto).mockRejectedValue(unexpected);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.iniciar({ id: "p1" }),
    ).rejects.toThrow("Unexpected failure");
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.iniciar({ id: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("proyectos.detener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("calls detenerProyecto without servicios and updates estado to stopped", async () => {
    const runningProyecto = { ...mockProyecto, estado: "running" as const };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      runningProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...runningProyecto,
      estado: "stopped",
    } as never);
    vi.mocked(detenerProyecto).mockResolvedValue(undefined);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.detener({ id: "p1" });

    expect(detenerProyecto).toHaveBeenCalledWith("cliente-uno", "web-app");
    expect(detenerProyecto).toHaveBeenCalledTimes(1);
    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { estado: "stopped" },
    });
    expect(result.estado).toBe("stopped");
  });

  it("throws NOT_FOUND when project does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.detener({ id: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws INTERNAL_SERVER_ERROR when Docker returns DockerError", async () => {
    const runningProyecto = { ...mockProyecto, estado: "running" as const };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      runningProyecto as never,
    );
    vi.mocked(detenerProyecto).mockRejectedValue(
      new DockerError("NOT_FOUND", "Container not found"),
    );

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.detener({ id: "p1" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rethrows non-DockerError from detenerProyecto", async () => {
    const runningProyecto = { ...mockProyecto, estado: "running" as const };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      runningProyecto as never,
    );
    const unexpected = new Error("Unexpected failure");
    vi.mocked(detenerProyecto).mockRejectedValue(unexpected);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.detener({ id: "p1" }),
    ).rejects.toThrow("Unexpected failure");
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.detener({ id: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("proyectos.restart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("calls restartProyecto without servicios and updates estado to running", async () => {
    const runningProyecto = { ...mockProyecto, estado: "running" as const };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      runningProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...runningProyecto,
      estado: "running",
    } as never);
    vi.mocked(restartProyecto).mockResolvedValue(undefined);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.restart({ id: "p1" });

    expect(restartProyecto).toHaveBeenCalledWith("cliente-uno", "web-app");
    expect(restartProyecto).toHaveBeenCalledTimes(1);
    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { estado: "running" },
    });
    expect(result.estado).toBe("running");
  });

  it("throws NOT_FOUND when project does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.restart({ id: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws INTERNAL_SERVER_ERROR when Docker returns DockerError", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(restartProyecto).mockRejectedValue(
      new DockerError("NOT_FOUND", "Container not found"),
    );

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.restart({ id: "p1" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rethrows non-DockerError from restartProyecto", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(restartProyecto).mockRejectedValue(
      new Error("Unexpected failure"),
    );

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.restart({ id: "p1" }),
    ).rejects.toThrow("Unexpected failure");
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.restart({ id: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

const mockClienteRow = {
  id: "c1",
  slug: "cliente-uno",
  nombre: "Cliente Uno",
  creadoEn: new Date(),
};

describe("proyectos.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("creates proyecto without servicios and returns it", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    const created = {
      ...mockProyecto,
      nombre: "nuevo-proyecto",
      dominio: "nuevo.example.com",
      cliente: mockClienteRow,
    };
    vi.mocked(prisma.proyecto.create).mockResolvedValue(created as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "nuevo-proyecto",
      dominio: "nuevo.example.com",
    });

    expect(result.nombre).toBe("nuevo-proyecto");
    expect(prisma.proyecto.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: "nuevo-proyecto",
          clienteId: "c1",
        }),
      }),
    );
    const createData = vi.mocked(prisma.proyecto.create).mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(createData).not.toHaveProperty("servicios");
  });

  it("throws NOT_FOUND when cliente does not exist", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "nope",
        nombre: "x",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when nombre contains path traversal characters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "c1",
        nombre: "../../etc",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when nombre contains uppercase letters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "c1",
        nombre: "MyProject",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("llama asegurarRedCliente con el slug del cliente tras crear", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
    });

    expect(asegurarRedCliente).toHaveBeenCalledWith("cliente-uno");
  });
});

describe("proyectos.editar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("updates proyecto and returns it", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app-v2",
      dominio: "v2.example.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app-v2",
      dominio: "v2.example.com",
    });

    expect(result.nombre).toBe("web-app-v2");
    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" } }),
    );
    const updateData = vi.mocked(prisma.proyecto.update).mock.calls[0][0]
      .data as Record<string, unknown>;
    expect(updateData).not.toHaveProperty("servicios");
  });

  it("throws NOT_FOUND when proyecto does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "nope",
        nombre: "x",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT only when nombre changes AND proyecto is running", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app",
      estado: "running",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "p1",
        nombre: "new-name",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows editar without name change even when running", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app",
      estado: "running",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app",
      dominio: "new.example.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      dominio: "new.example.com",
    });

    expect(result.dominio).toBe("new.example.com");
  });

  it("throws CONFLICT when nombre changes AND proyecto is deploying", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app",
      estado: "deploying",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "p1",
        nombre: "different-name",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws BAD_REQUEST when nombre contains path traversal characters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "p1",
        nombre: "../../etc",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("proyectos.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);
  });

  it("deletes proyecto directly without deleteMany servicios", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(result).toBeUndefined();
    expect(prisma.proyecto.delete).toHaveBeenCalledWith({
      where: { id: "p1" },
    });
  });

  it("throws NOT_FOUND when proyecto does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.eliminar({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when proyecto is running", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      estado: "running",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.eliminar({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("llama eliminarRedCliente cuando era el último proyecto del cliente", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(eliminarRedCliente).toHaveBeenCalledWith("cliente-uno");
  });

  it("no llama eliminarRedCliente si quedan proyectos en el cliente", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.count).mockResolvedValue(1);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(eliminarRedCliente).not.toHaveBeenCalled();
  });
});

describe("proyectos — integración Traefik", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(generarConfigTraefik).mockReturnValue("yaml-content");
    vi.mocked(escribirConfigTraefik).mockResolvedValue(undefined);
    vi.mocked(eliminarConfigTraefik).mockResolvedValue(undefined);
  });

  it("crear: escribe config Traefik cuando el proyecto tiene dominio", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
      dominio: "app.cliente-uno.com",
    });

    expect(generarConfigTraefik).toHaveBeenCalledWith({
      dominio: "app.cliente-uno.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });
    expect(escribirConfigTraefik).toHaveBeenCalledWith(
      "web-app",
      "yaml-content",
    );
  });

  it("crear: no escribe config Traefik cuando no hay dominio", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
    });

    expect(escribirConfigTraefik).not.toHaveBeenCalled();
  });

  it("editar: reescribe config Traefik cuando el proyecto tiene dominio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: "nuevo.example.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      dominio: "nuevo.example.com",
    });

    expect(escribirConfigTraefik).toHaveBeenCalledWith(
      "web-app",
      "yaml-content",
    );
  });

  it("editar: elimina config Traefik cuando se quita el dominio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
    });

    expect(eliminarConfigTraefik).toHaveBeenCalledWith("web-app");
    expect(escribirConfigTraefik).not.toHaveBeenCalled();
  });

  it("eliminar: elimina config Traefik si el proyecto tenía dominio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(eliminarConfigTraefik).toHaveBeenCalledWith("web-app");
  });

  it("eliminar: no llama a Traefik si el proyecto no tenía dominio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(eliminarConfigTraefik).not.toHaveBeenCalled();
  });

  it("crear: pasa puerto a generarConfigTraefik cuando el proyecto tiene puerto configurado", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.cliente-uno.com",
      puerto: 3000,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
      dominio: "app.cliente-uno.com",
      puerto: 3000,
    });

    expect(generarConfigTraefik).toHaveBeenCalledWith(
      expect.objectContaining({ puerto: 3000 }),
    );
  });

  it("editar: pasa puerto a generarConfigTraefik cuando el proyecto editado tiene puerto", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
      puerto: 3000,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      dominio: "app.ejemplo.com",
      puerto: 3000,
    });

    expect(generarConfigTraefik).toHaveBeenCalledWith(
      expect.objectContaining({ puerto: 3000 }),
    );
  });
});

describe("proyectos.deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
  });

  it("llama a ejecutarDeploy sin servicios y retorna estado deploying inmediatamente", async () => {
    const proyecto = {
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
      rama: "main",
    };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(proyecto as never);
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...proyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...proyecto, estado: "running" } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(result.estado).toBe("deploying");
    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoId: "p1",
        repoUrl: "https://github.com/org/repo",
        rama: "main",
        clienteSlug: "cliente-uno",
        proyectoNombre: "web-app",
      }),
    );
    const deployCall = vi.mocked(ejecutarDeploy).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(deployCall).not.toHaveProperty("servicios");

    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledTimes(2);
    });
    expect(prisma.proyecto.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ estado: "running" }),
      }),
    );
  });

  it("actualiza estado a error en background cuando ejecutarDeploy retorna error", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "build failed",
    });
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "error" } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(result.estado).toBe("deploying");
    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledTimes(2);
    });
    expect(prisma.proyecto.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "error" }),
      }),
    );
  });

  it("lanza CONFLICT si el proyecto está en estado deploying", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      estado: "deploying",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lanza CONFLICT si falta repositorioUrl", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("usa credencial cuando el proyecto tiene credencialId configurado", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      credencialId: "cred-1",
      repositorioUrl: "https://github.com/org/repo",
    } as never);
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue({
      id: "cred-1",
      nombre: "GitHub key",
      clavePublica: "ssh-rsa AAAA...",
      clavePrivadaCifrada: "enc-key",
      iv: "iv-hex",
      authTag: "auth-hex",
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    } as never);
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "running" } as never);
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    await vi.waitFor(() => {
      expect(ejecutarDeploy).toHaveBeenCalledWith(
        expect.objectContaining({
          credencial: { clavePrivada: "valor-descifrado" },
        }),
      );
    });
  });

  it("lanza CONFLICT si tipo es image y imagenUrl no está configurada", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      tipo: "image" as const,
      imagenUrl: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("imagen"),
    });
  });

  it("actualiza estado a error cuando ejecutarDeploy lanza una excepción", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
    } as never);
    vi.mocked(ejecutarDeploy).mockRejectedValue(new Error("fatal build error"));
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "error" } as never);
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: "error" } }),
      );
    });
  });
});

describe("proyectos.toggleAutoDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("activa autoDeployHabilitado cuando estaba false", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      autoDeployHabilitado: false,
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      autoDeployHabilitado: true,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.toggleAutoDeploy({
      id: "p1",
    });

    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { autoDeployHabilitado: true },
    });
    expect(result.autoDeployHabilitado).toBe(true);
  });

  it("desactiva autoDeployHabilitado cuando estaba true", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      autoDeployHabilitado: true,
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      autoDeployHabilitado: false,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.toggleAutoDeploy({
      id: "p1",
    });

    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { autoDeployHabilitado: false },
    });
    expect(result.autoDeployHabilitado).toBe(false);
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.toggleAutoDeploy({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("proyectos.obtener", () => {
  const mockProyectoConCliente = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "running" as const,
    dominio: "app.cliente-uno.com",
    repositorioUrl: "https://github.com/org/web-app",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ultimoDeployRama: "main",
    tipo: "compose" as const,
    puerto: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    credencialId: null,
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
    credencial: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve el proyecto con cliente sin servicios y con credencialId", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoConCliente as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.nombre).toBe("web-app");
    expect(result.clienteNombre).toBe("Cliente Uno");
    expect(result.clienteSlug).toBe("cliente-uno");
    expect(result.credencialId).toBeNull();
    expect(result.tipo).toBe("compose");
    expect(result.puerto).toBeNull();
    expect(result).not.toHaveProperty("servicios");
  });

  it("mapea ultimoDeployEn a objeto ultimoDeploy", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoConCliente as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.ultimoDeploy).not.toBeNull();
    expect(result.ultimoDeploy?.rama).toBe("main");
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.obtener({ id: "no-existe" }),
    ).rejects.toThrow("no encontrado");
  });

  it("devuelve ultimoDeploy como null cuando ultimoDeployEn es null", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyectoConCliente,
      ultimoDeployEn: null,
      ultimoDeployRama: null,
    } as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.ultimoDeploy).toBeNull();
  });
});

describe("proyectos.deploy — con variables de entorno", () => {
  const mockProyectoConRepo = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "stopped" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/web-app",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoConRepo as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyectoConRepo,
      estado: "running",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
  });

  it("descifra variables y las pasa a ejecutarDeploy", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        clave: "DATABASE_URL",
        valorCifrado: "cifrado",
        iv: "iv",
        authTag: "tag",
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(descifrar).toHaveBeenCalledWith("cifrado", "iv", "tag");
    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: [{ clave: "DATABASE_URL", valor: "valor-descifrado" }],
      }),
    );
  });

  it("llama a ejecutarDeploy con variables vacías si no hay ninguna", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });
    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: [] }),
    );
  });

  it("descifra variablesBuildTime y las pasa a ejecutarDeploy", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        clave: "BUILD_VAR",
        valorCifrado: "cifrado-build",
        iv: "iv-build",
        authTag: "tag-build",
        enBuildTime: true,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        variablesBuildTime: [{ clave: "BUILD_VAR", valor: "valor-descifrado" }],
      }),
    );
  });

  it("pasa volumenes con rutaHost calculada a ejecutarDeploy", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    vi.mocked(prisma.volumen.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        nombre: "galeria",
        rutaContenedor: "/app/public/galeria",
        creadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        volumenes: [
          {
            rutaHost: "/var/vicalba/repos/cliente-uno/web-app/volumes/galeria",
            rutaContenedor: "/app/public/galeria",
          },
        ],
      }),
    );
  });
});

describe("proyectos.listarDeploys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve los últimos deploys del proyecto incluyendo sha", async () => {
    const deploys = [
      {
        id: "d1",
        rama: "main",
        sha: "abc123",
        resultado: "exito",
        output: "ok",
        iniciadoEn: new Date(),
        finalizadoEn: new Date(),
      },
    ];
    vi.mocked(prisma.deploy.findMany).mockResolvedValue(deploys as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.listarDeploys({
      proyectoId: "p1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].rama).toBe("main");
    expect(result[0].resultado).toBe("exito");
    expect(result[0].sha).toBe("abc123");
    expect(prisma.deploy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyectoId: "p1" },
        orderBy: { iniciadoEn: "desc" },
        take: 20,
        select: expect.objectContaining({ sha: true }),
      }),
    );
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.listarDeploys({ proyectoId: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("proyectos.rollback", () => {
  const mockDeploy = {
    id: "d1",
    proyectoId: "p1",
    rama: "main",
    sha: "abc123",
    resultado: "exito" as const,
    output: "ok",
    iniciadoEn: new Date(),
    finalizadoEn: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue(mockDeploy as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "running",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
  });

  it("llama a ejecutarDeploy sin servicios con sha, proyectoId y rama del deploy anterior", async () => {
    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoId: "p1",
        sha: "abc123",
        rama: "main",
        clienteSlug: "cliente-uno",
        proyectoNombre: "web-app",
      }),
    );
    const rollbackCall = vi.mocked(ejecutarDeploy).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(rollbackCall).not.toHaveProperty("servicios");
  });

  it("retorna deploying inmediatamente y actualiza a running en background", async () => {
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "running" } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.rollback({
      deployId: "d1",
    });

    expect(result.estado).toBe("deploying");
    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledTimes(2);
    });
    expect(prisma.proyecto.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ estado: "running" }),
      }),
    );
  });

  it("actualiza estado a error en background cuando ejecutarDeploy retorna error", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "fallo",
    });
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "error" } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledTimes(2);
    });
    expect(prisma.proyecto.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "error" }),
      }),
    );
  });

  it("lanza NOT_FOUND si el deploy no existe", async () => {
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lanza BAD_REQUEST si resultado no es exito", async () => {
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue({
      ...mockDeploy,
      resultado: "error" as const,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lanza BAD_REQUEST si sha es null", async () => {
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue({
      ...mockDeploy,
      sha: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lanza CONFLICT si el proyecto está en estado deploying", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      estado: "deploying" as const,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("usa credencial cuando el proyecto tiene credencialId en rollback", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      credencialId: "cred-1",
    } as never);
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue({
      id: "cred-1",
      nombre: "GitHub key",
      clavePublica: "ssh-rsa AAAA...",
      clavePrivadaCifrada: "enc-key",
      iv: "iv-hex",
      authTag: "auth-hex",
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    await vi.waitFor(() => {
      expect(ejecutarDeploy).toHaveBeenCalledWith(
        expect.objectContaining({
          credencial: { clavePrivada: "valor-descifrado" },
        }),
      );
    });
  });

  it("descifra variables y las pasa a ejecutarDeploy en rollback", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        clave: "API_KEY",
        valorCifrado: "enc-val",
        iv: "iv-val",
        authTag: "tag-val",
        proyectoId: "p1",
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(descifrar).toHaveBeenCalledWith("enc-val", "iv-val", "tag-val");
    await vi.waitFor(() => {
      expect(ejecutarDeploy).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: [{ clave: "API_KEY", valor: "valor-descifrado" }],
        }),
      );
    });
  });

  it("actualiza estado a error cuando ejecutarDeploy lanza una excepción en rollback", async () => {
    vi.mocked(ejecutarDeploy).mockRejectedValue(
      new Error("fatal rollback error"),
    );
    vi.mocked(prisma.proyecto.update)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "deploying" } as never)
      .mockResolvedValueOnce({ ...mockProyecto, estado: "error" } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    await vi.waitFor(() => {
      expect(prisma.proyecto.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { estado: "error" } }),
      );
    });
  });

  it("descifra variablesBuildTime y las pasa a ejecutarDeploy en rollback", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        clave: "BUILD_VAR",
        valorCifrado: "cifrado-build",
        iv: "iv-build",
        authTag: "tag-build",
        enBuildTime: true,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    await vi.waitFor(() => {
      expect(ejecutarDeploy).toHaveBeenCalledWith(
        expect.objectContaining({
          variablesBuildTime: [
            { clave: "BUILD_VAR", valor: "valor-descifrado" },
          ],
        }),
      );
    });
  });

  it("no separa variables build-time en rollback de proyecto compose con composeContent", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      tipo: "compose" as const,
      composeContent: "services:\n  app:\n    image: nginx\n",
    } as never);
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        clave: "BUILD_VAR",
        valorCifrado: "cifrado-build",
        iv: "iv-build",
        authTag: "tag-build",
        enBuildTime: true,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    await vi.waitFor(() => {
      expect(ejecutarDeploy).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: [{ clave: "BUILD_VAR", valor: "valor-descifrado" }],
          variablesBuildTime: [],
        }),
      );
    });
  });
});

describe("proyectos.asignarCredencial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
  });

  it("asigna una credencial al proyecto", async () => {
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      credencialId: "cred-1",
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.asignarCredencial({
      id: "p1",
      credencialId: "cred-1",
    });

    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { credencialId: "cred-1" },
      }),
    );
  });

  it("desasigna credencial al pasar null", async () => {
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      credencialId: null,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.asignarCredencial({
      id: "p1",
      credencialId: null,
    });

    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { credencialId: null },
      }),
    );
  });
});

describe("proyectos — integración Traefik redes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(conectarTraefikARed).mockResolvedValue(undefined);
    vi.mocked(desconectarTraefikDeRed).mockResolvedValue(undefined);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);
  });

  it("crear con dominio llama conectarTraefikARed", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
      dominio: "app.ejemplo.com",
    });

    expect(conectarTraefikARed).toHaveBeenCalledWith("cliente-uno");
  });

  it("crear sin dominio no llama conectarTraefikARed", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
    });

    expect(conectarTraefikARed).not.toHaveBeenCalled();
  });

  it("editar añadiendo dominio llama conectarTraefikARed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: "nuevo.ejemplo.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      dominio: "nuevo.ejemplo.com",
    });

    expect(conectarTraefikARed).toHaveBeenCalledWith("cliente-uno");
  });

  it("editar quitando dominio (sin otros con dominio) llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "viejo.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
    });

    expect(desconectarTraefikDeRed).toHaveBeenCalledWith("cliente-uno");
  });

  it("editar quitando dominio (hay otros con dominio) no llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "viejo.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(1);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
    });

    expect(desconectarTraefikDeRed).not.toHaveBeenCalled();
  });

  it("eliminar con dominio (último del cliente) llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count)
      .mockResolvedValueOnce(0) // otrosConDominio
      .mockResolvedValueOnce(0); // restantes (para eliminarRedCliente)

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(desconectarTraefikDeRed).toHaveBeenCalledWith("cliente-uno");
  });

  it("eliminar con dominio (quedan otros con dominio) no llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count)
      .mockResolvedValueOnce(1) // otrosConDominio
      .mockResolvedValueOnce(1); // restantes

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(desconectarTraefikDeRed).not.toHaveBeenCalled();
  });
});

describe("proyectos.estadoSSL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve el estado SSL del dominio", async () => {
    vi.mocked(leerEstadoSSL).mockResolvedValue({ activo: true });

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.estadoSSL({
      dominio: "app.ejemplo.com",
    });

    expect(leerEstadoSSL).toHaveBeenCalledWith("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.estadoSSL({ dominio: "app.ejemplo.com" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("proyectos.deploy — notificaciones", () => {
  const mockProyectoParaDeploy = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "stopped" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/repo",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoParaDeploy as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue(
      mockProyectoParaDeploy as never,
    );
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    vi.mocked(enviarNotificacion).mockResolvedValue(undefined);
  });

  it("llama enviarNotificacion tras deploy exitoso", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "Build OK",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoNombre: "web-app",
        clienteSlug: "cliente-uno",
        rama: "main",
        resultado: "exito",
        output: "Build OK",
      }),
    );
  });

  it("llama enviarNotificacion tras deploy fallido", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "Build failed",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "error", output: "Build failed" }),
    );
  });

  it("enviarNotificacion que falla no rompe el resultado del deploy", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "ok",
    });
    vi.mocked(enviarNotificacion).mockRejectedValue(new Error("notif falló"));

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).resolves.toBeDefined();
  });
});

describe("proyectos.rollback — notificaciones", () => {
  const mockDeploy = {
    id: "d1",
    proyectoId: "p1",
    rama: "main",
    sha: "deadbeef",
    resultado: "exito" as const,
    output: "prev build",
    iniciadoEn: new Date(),
    finalizadoEn: new Date(),
  };

  const mockProyectoParaRollback = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "running" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/repo",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue(mockDeploy as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoParaRollback as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue(
      mockProyectoParaRollback as never,
    );
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    vi.mocked(enviarNotificacion).mockResolvedValue(undefined);
  });

  it("llama enviarNotificacion tras rollback exitoso con el sha correcto", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "Rollback OK",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoNombre: "web-app",
        sha: "deadbeef",
        resultado: "exito",
        output: "Rollback OK",
      }),
    );
  });

  it("llama enviarNotificacion tras rollback fallido", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "Rollback failed",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "error" }),
    );
  });

  it("enviarNotificacion que falla no rompe el resultado del rollback", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "ok",
    });
    vi.mocked(enviarNotificacion).mockRejectedValue(new Error("notif falló"));

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).resolves.toBeDefined();
  });

  it("pasa sha null cuando el deploy no tiene sha → lanza BAD_REQUEST", async () => {
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue({
      ...mockDeploy,
      sha: null,
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "ok",
    });

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("proyectos.obtenerCompose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve composeContent del proyecto", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      composeContent: "services:\n  web:\n    image: nginx\n",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtenerCompose({
      id: "p1",
    });

    expect(result.composeContent).toBe("services:\n  web:\n    image: nginx\n");
  });

  it("devuelve composeContent null cuando no hay compose guardado", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      composeContent: null,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtenerCompose({
      id: "p1",
    });

    expect(result.composeContent).toBeNull();
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.obtenerCompose({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("proyectos.guardarCompose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("guarda composeContent en BD y lo devuelve", async () => {
    const content = "services:\n  app:\n    image: myapp:latest\n";
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      composeContent: content,
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.guardarCompose({
      id: "p1",
      composeContent: content,
    });

    expect(prisma.proyecto.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { composeContent: content },
    });
    expect(result.composeContent).toBe(content);
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.guardarCompose({
        id: "nope",
        composeContent: "services: {}",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("proyectos.deploy — composeContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
  });

  it("pasa composeContent a ejecutarDeploy cuando el proyecto lo tiene", async () => {
    const content = "services:\n  web:\n    image: nginx\n";
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      composeContent: content,
      repositorioUrl: null,
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "deploying",
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ composeContent: content }),
    );
  });

  it("permite deploy de tipo compose sin repositorioUrl cuando hay composeContent", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: null,
      composeContent: "services:\n  app:\n    image: nginx\n",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "deploying",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).resolves.toBeDefined();
  });

  it("sigue lanzando CONFLICT para compose sin repositorioUrl ni composeContent", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: null,
      composeContent: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("proyectos.cargarComposeDesdeRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.cargarComposeDesdeRepo({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lanza BAD_REQUEST si el proyecto no tiene repositorio configurado", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.cargarComposeDesdeRepo({ id: "p1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("clona/actualiza el repo y sustituye build/context por ruta relativa, sin credencial", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      credencialId: null,
    } as never);
    vi.mocked(readFile).mockResolvedValue(
      [
        "services:",
        "  app:",
        "    build: .",
        "    image: myapp",
        "  other:",
        "    build:",
        "      context: .",
      ].join("\n") as never,
    );

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.cargarComposeDesdeRepo({
      id: "p1",
    });

    expect(prepararRepo).toHaveBeenCalledWith(
      "https://github.com/org/web-app",
      "/var/vicalba/repos/cliente-uno/web-app",
      "main",
      expect.any(Object),
    );
    expect(readFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/cliente-uno/web-app/docker-compose.yml",
      "utf-8",
    );
    expect(result.composeContent).toContain("build: ../web-app");
    expect(result.composeContent).toContain("context: ../web-app");
  });

  it("usa clave SSH de la credencial y convierte la URL a formato git@ cuando el proyecto tiene credencialId", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      credencialId: "cred-1",
    } as never);
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue({
      id: "cred-1",
      nombre: "GitHub key",
      clavePublica: "ssh-rsa AAAA...",
      clavePrivadaCifrada: "enc-key",
      iv: "iv-hex",
      authTag: "auth-hex",
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    } as never);
    vi.mocked(readFile).mockResolvedValue(
      "services:\n  app:\n    image: x\n" as never,
    );

    const ctx = await createContext();
    await createCaller(ctx).proyectos.cargarComposeDesdeRepo({ id: "p1" });

    expect(prepararRepo).toHaveBeenCalledWith(
      "git@github.com:org/web-app.git",
      "/var/vicalba/repos/cliente-uno/web-app",
      "main",
      expect.objectContaining({
        GIT_SSH_COMMAND: expect.stringContaining(
          "/var/vicalba/repos/cliente-uno/.panel/web-app.deploy_key",
        ),
      }),
    );
  });

  it("lanza NOT_FOUND si no encuentra docker-compose.yml en el repositorio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      credencialId: null,
    } as never);
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.cargarComposeDesdeRepo({ id: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
