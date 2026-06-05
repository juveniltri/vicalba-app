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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    proyecto: {
      count: vi.fn(),
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

const mockCliente = {
  id: "cli1",
  slug: "cliente-uno",
  nombre: "Cliente Uno",
  creadoEn: new Date(),
};

describe("clientes.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("creates and returns the new cliente", async () => {
    vi.mocked(prisma.cliente.create).mockResolvedValue(mockCliente as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).clientes.crear({
      slug: "cliente-uno",
      nombre: "Cliente Uno",
    });

    expect(result.slug).toBe("cliente-uno");
    expect(result.nombre).toBe("Cliente Uno");
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: { slug: "cliente-uno", nombre: "Cliente Uno" },
    });
  });

  it("rejects invalid slug format", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.crear({
        slug: "INVALID SLUG!",
        nombre: "Test",
      }),
    ).rejects.toThrow();
  });

  it("throws CONFLICT when slug already exists", async () => {
    vi.mocked(prisma.cliente.create).mockRejectedValue({ code: "P2002" });

    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.crear({
        slug: "cliente-uno",
        nombre: "Cliente Uno",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rethrows non-P2002 errors from prisma", async () => {
    vi.mocked(prisma.cliente.create).mockRejectedValue(
      new Error("connection error"),
    );

    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.crear({
        slug: "cliente-uno",
        nombre: "Cliente Uno",
      }),
    ).rejects.toThrow("connection error");
  });
});

describe("clientes.editar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("updates nombre and returns the cliente", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockCliente as never,
    );
    vi.mocked(prisma.cliente.update).mockResolvedValue({
      ...mockCliente,
      nombre: "Nuevo Nombre",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).clientes.editar({
      id: "cli1",
      nombre: "Nuevo Nombre",
    });

    expect(result.nombre).toBe("Nuevo Nombre");
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: "cli1" },
      data: { nombre: "Nuevo Nombre" },
    });
  });

  it("throws NOT_FOUND when cliente does not exist", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.editar({ id: "nope", nombre: "X" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("clientes.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("deletes cliente and returns undefined when no proyectos exist", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockCliente as never,
    );
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.cliente.delete).mockResolvedValue(mockCliente as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).clientes.eliminar({ id: "cli1" });

    expect(result).toBeUndefined();
    expect(prisma.cliente.delete).toHaveBeenCalledWith({
      where: { id: "cli1" },
    });
  });

  it("throws NOT_FOUND when cliente does not exist", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.eliminar({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws CONFLICT when cliente has proyectos", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockCliente as never,
    );
    vi.mocked(prisma.proyecto.count).mockResolvedValue(2 as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).clientes.eliminar({ id: "cli1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
