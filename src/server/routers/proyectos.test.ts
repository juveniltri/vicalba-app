// src/server/routers/proyectos.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    servicio: { deleteMany: vi.fn() },
    variableEntorno: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    deploy: { findMany: vi.fn(), findUnique: vi.fn() },
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
import { asegurarRedCliente, eliminarRedCliente } from "@/lib/docker/networks";
import { descifrar } from "@/lib/crypto";
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
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        servicios: [
          {
            id: "s1",
            nombre: "nginx",
            estado: "running" as const,
            proyectoId: "p1",
            creadoEn: new Date(),
          },
        ],
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
    expect(result[0].proyectos[0].servicios[0].nombre).toBe("nginx");
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

  it("calls prisma with correct query options", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    await caller.proyectos.listar();

    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      include: {
        proyectos: {
          include: { servicios: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });
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
  creadoEn: new Date(),
  actualizadoEn: new Date(),
  cliente: {
    id: "c1",
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    creadoEn: new Date(),
  },
  servicios: [
    {
      id: "s1",
      nombre: "nginx",
      estado: "stopped" as const,
      proyectoId: "p1",
      creadoEn: new Date(),
    },
    {
      id: "s2",
      nombre: "node",
      estado: "stopped" as const,
      proyectoId: "p1",
      creadoEn: new Date(),
    },
  ],
};

describe("proyectos.iniciar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("calls iniciarProyecto and updates estado to running", async () => {
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

    expect(iniciarProyecto).toHaveBeenCalledWith("cliente-uno", "web-app", [
      "nginx",
      "node",
    ]);
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

  it("calls detenerProyecto and updates estado to stopped", async () => {
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

    expect(detenerProyecto).toHaveBeenCalledWith("cliente-uno", "web-app", [
      "nginx",
      "node",
    ]);
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

  it("calls restartProyecto and updates estado to running", async () => {
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

    expect(restartProyecto).toHaveBeenCalledWith("cliente-uno", "web-app", [
      "nginx",
      "node",
    ]);
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

  it("creates proyecto with servicios and returns it", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    const created = {
      ...mockProyecto,
      nombre: "nuevo-proyecto",
      dominio: "nuevo.example.com",
      servicios: [
        {
          id: "s3",
          nombre: "nginx",
          estado: "stopped" as const,
          proyectoId: "p1",
          creadoEn: new Date(),
        },
      ],
      cliente: mockClienteRow,
    };
    vi.mocked(prisma.proyecto.create).mockResolvedValue(created as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "nuevo-proyecto",
      dominio: "nuevo.example.com",
      servicios: ["nginx"],
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
  });

  it("throws NOT_FOUND when cliente does not exist", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "nope",
        nombre: "x",
        servicios: ["nginx"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when nombre contains path traversal characters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "c1",
        nombre: "../../etc",
        servicios: ["nginx"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when nombre contains uppercase letters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.crear({
        clienteId: "c1",
        nombre: "MyProject",
        servicios: ["nginx"],
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
      servicios: ["nginx"],
    });

    expect(asegurarRedCliente).toHaveBeenCalledWith("cliente-uno");
  });
});

describe("proyectos.editar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("updates proyecto and reconciles servicios", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      nombre: "web-app-v2",
      dominio: "v2.example.com",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app-v2",
      dominio: "v2.example.com",
      servicios: ["nginx", "redis"],
    });

    expect(result.nombre).toBe("web-app-v2");
    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" } }),
    );
  });

  it("throws NOT_FOUND when proyecto does not exist", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "nope",
        nombre: "x",
        servicios: ["nginx"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when proyecto is running", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      estado: "running",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "p1",
        nombre: "x",
        servicios: ["nginx"],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws BAD_REQUEST when nombre contains path traversal characters", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.editar({
        id: "p1",
        nombre: "../../etc",
        servicios: ["nginx"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("proyectos.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.servicio.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);
  });

  it("deletes proyecto and its servicios when stopped", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(result).toBeUndefined();
    expect(prisma.servicio.deleteMany).toHaveBeenCalledWith({
      where: { proyectoId: "p1" },
    });
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
      servicios: ["nginx"],
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
      servicios: ["nginx"],
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
      servicios: ["nginx"],
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
      servicios: ["nginx"],
    });

    expect(eliminarConfigTraefik).toHaveBeenCalledWith("web-app");
    expect(escribirConfigTraefik).not.toHaveBeenCalled();
  });

  it("eliminar: elimina config Traefik si el proyecto tenía dominio", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    vi.mocked(prisma.servicio.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
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
    vi.mocked(prisma.servicio.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(eliminarConfigTraefik).not.toHaveBeenCalled();
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

  it("llama a ejecutarDeploy con proyectoId y actualiza estado a running en éxito", async () => {
    const proyecto = {
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
      rama: "main",
    };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(proyecto as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...proyecto,
      estado: "running",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoId: "p1",
        repoUrl: "https://github.com/org/repo",
        rama: "main",
        clienteSlug: "cliente-uno",
        proyectoNombre: "web-app",
        servicios: ["nginx", "node"],
      }),
    );
    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ estado: "running" }),
      }),
    );
    expect(result.estado).toBe("running");
  });

  it("actualiza estado a error cuando ejecutarDeploy retorna error", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "build failed",
    });
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "error",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "error" }),
      }),
    );
    expect(result.estado).toBe("error");
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
  const mockProyecto = {
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
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
    servicios: [
      {
        id: "s1",
        nombre: "nginx",
        estado: "running" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve el proyecto con cliente y servicios", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.nombre).toBe("web-app");
    expect(result.clienteNombre).toBe("Cliente Uno");
    expect(result.clienteSlug).toBe("cliente-uno");
    expect(result.servicios[0].nombre).toBe("nginx");
  });

  it("mapea ultimoDeployEn a objeto ultimoDeploy", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
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
    servicios: [
      {
        id: "s1",
        nombre: "app",
        estado: "stopped" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
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

  it("llama a ejecutarDeploy con sha, proyectoId y rama del deploy anterior", async () => {
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
  });

  it("actualiza estado a running cuando ejecutarDeploy retorna exito", async () => {
    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(prisma.proyecto.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ estado: "running" }),
      }),
    );
  });

  it("actualiza estado a error cuando ejecutarDeploy retorna error", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "fallo",
    });
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "error",
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

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
});
