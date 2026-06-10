import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/crypto", () => ({
  cifrar: vi.fn().mockReturnValue({
    valorCifrado: "cifrado",
    iv: "iv-hex",
    authTag: "auth-hex",
  }),
  descifrar: vi.fn().mockReturnValue("clave-privada-plana"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    credencial: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { cifrar } from "@/lib/crypto";
import { credencialesRouter, descifrarClavePrivada } from "./credenciales";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(credencialesRouter);
const caller = createCaller({ session: { user: { id: "u1" } } } as never);

const credencialBase = {
  id: "cred1",
  nombre: "GitHub personal",
  clavePublica: "ssh-rsa AAAA...",
  clavePrivadaCifrada: "cifrado",
  iv: "iv-hex",
  authTag: "auth-hex",
  creadoEn: new Date(),
  actualizadoEn: new Date(),
};

describe("credenciales.listar", () => {
  it("devuelve la lista sin clave privada", async () => {
    vi.mocked(prisma.credencial.findMany).mockResolvedValue([
      {
        id: "cred1",
        nombre: "GitHub personal",
        clavePublica: "ssh-rsa AAAA...",
        creadoEn: new Date(),
      },
    ] as never);

    const result = await caller.listar();

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("clavePrivadaCifrada");
    expect(result[0]).not.toHaveProperty("iv");
  });
});

describe("credenciales.crear", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cifra la clave privada y crea la credencial", async () => {
    vi.mocked(prisma.credencial.create).mockResolvedValue({
      id: "cred1",
      nombre: "GitHub personal",
      clavePublica: "ssh-rsa AAAA...",
      creadoEn: new Date(),
    } as never);

    await caller.crear({
      nombre: "GitHub personal",
      clavePublica: "ssh-rsa AAAA...",
      clavePrivada: "-----BEGIN RSA PRIVATE KEY-----",
    });

    expect(cifrar).toHaveBeenCalledWith("-----BEGIN RSA PRIVATE KEY-----");
    expect(prisma.credencial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: "GitHub personal",
          clavePrivadaCifrada: "cifrado",
          iv: "iv-hex",
          authTag: "auth-hex",
        }),
      }),
    );
  });

  it("lanza CONFLICT si el nombre ya existe (P2002)", async () => {
    vi.mocked(prisma.credencial.create).mockRejectedValue({ code: "P2002" });

    await expect(
      caller.crear({
        nombre: "GitHub personal",
        clavePublica: "ssh-rsa AAAA...",
        clavePrivada: "key",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("credenciales.eliminar", () => {
  it("elimina la credencial existente", async () => {
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue(
      credencialBase as never,
    );
    vi.mocked(prisma.credencial.delete).mockResolvedValue(
      credencialBase as never,
    );

    await caller.eliminar({ id: "cred1" });

    expect(prisma.credencial.delete).toHaveBeenCalledWith({
      where: { id: "cred1" },
    });
  });

  it("lanza NOT_FOUND si no existe", async () => {
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue(null);

    await expect(caller.eliminar({ id: "no-existe" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("credenciales.obtenerClavePublica", () => {
  it("devuelve solo la clave pública", async () => {
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue(
      credencialBase as never,
    );

    const result = await caller.obtenerClavePublica({ id: "cred1" });

    expect(result.clavePublica).toBe("ssh-rsa AAAA...");
    expect(result).not.toHaveProperty("clavePrivadaCifrada");
  });
});

describe("descifrarClavePrivada", () => {
  it("descifra y devuelve la clave privada en texto plano", async () => {
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue(
      credencialBase as never,
    );

    const clave = await descifrarClavePrivada("cred1");

    expect(clave).toBe("clave-privada-plana");
  });

  it("lanza error si la credencial no existe", async () => {
    vi.mocked(prisma.credencial.findUnique).mockResolvedValue(null);

    await expect(descifrarClavePrivada("no-existe")).rejects.toThrow(
      "Credencial no-existe no encontrada",
    );
  });
});
