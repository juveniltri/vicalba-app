// src/server/routers/proyectos.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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

    await expect(caller.proyectos.listar()).rejects.toThrow();
  });
});
