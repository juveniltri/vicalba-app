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
vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: vi.fn(),
  desconectarTraefikDeRed: vi.fn(),
}));
vi.mock("@/lib/ssl/acme", () => ({
  leerEstadoSSL: vi.fn(),
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
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
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

  it("relanza errores que no son P2002", async () => {
    vi.mocked(prisma.variableEntorno.create).mockRejectedValue(
      new Error("Connection refused"),
    );
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "MY_VAR",
        valor: "x",
      }),
    ).rejects.toThrow("Connection refused");
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

describe("variables.importar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.variableEntorno.upsert).mockResolvedValue(
      mockVariable as never,
    );
  });

  it("parsea pares KEY=VALUE y llama a upsert por cada uno", async () => {
    const ctx = await createContext();
    await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "DATABASE_URL=postgres://localhost\nJWT_SECRET=supersecret",
    });
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledTimes(2);
    expect(cifrar).toHaveBeenCalledWith("postgres://localhost");
    expect(cifrar).toHaveBeenCalledWith("supersecret");
  });

  it("ignora comentarios y líneas vacías", async () => {
    const ctx = await createContext();
    await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "# comentario\n\nAPI_KEY=abc\n  \n",
    });
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledTimes(1);
  });

  it("elimina el prefijo export", async () => {
    const ctx = await createContext();
    await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "export MY_VAR=hello",
    });
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          proyectoId_clave: { proyectoId: "p1", clave: "MY_VAR" },
        }),
      }),
    );
  });

  it("elimina comillas dobles y simples del valor", async () => {
    const ctx = await createContext();
    await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "A=\"valor doble\"\nB='valor simple'",
    });
    expect(cifrar).toHaveBeenCalledWith("valor doble");
    expect(cifrar).toHaveBeenCalledWith("valor simple");
  });

  it("preserva el = dentro del valor", async () => {
    const ctx = await createContext();
    await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "URL=https://example.com?a=1&b=2",
    });
    expect(cifrar).toHaveBeenCalledWith("https://example.com?a=1&b=2");
  });

  it("devuelve invalidas para claves con formato incorrecto", async () => {
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "lowercase_key=val\n123_INVALID=val\nVALID_KEY=val",
    });
    expect(result.invalidas).toContain("lowercase_key");
    expect(result.invalidas).toContain("123_INVALID");
    expect(result.invalidas).not.toContain("VALID_KEY");
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledTimes(1);
  });

  it("devuelve creadas y actualizadas según si la clave existía", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      { clave: "EXISTING_KEY" },
    ] as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "EXISTING_KEY=nuevo\nNEW_KEY=valor",
    });
    expect(result.creadas).toBe(1);
    expect(result.actualizadas).toBe(1);
  });

  it("devuelve todo a cero si el contenido está vacío", async () => {
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "# solo comentarios\n\n",
    });
    expect(result.creadas).toBe(0);
    expect(result.actualizadas).toBe(0);
    expect(result.invalidas).toHaveLength(0);
    expect(prisma.variableEntorno.upsert).not.toHaveBeenCalled();
  });

  it("ignora líneas sin signo igual", async () => {
    vi.mocked(prisma.variableEntorno.upsert).mockResolvedValue({} as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.importar({
      proyectoId: "p1",
      contenido: "LINEA_SIN_IGUAL\nDB_HOST=localhost",
    });
    expect(result.creadas).toBe(1);
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledTimes(1);
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

describe("variables.toggleBuildTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("activa enBuildTime en la variable", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.update).mockResolvedValue({
      id: "v1",
      clave: "DATABASE_URL",
      enBuildTime: true,
      creadoEn: new Date(),
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).variables.toggleBuildTime({
      id: "v1",
      enBuildTime: true,
    });

    expect(prisma.variableEntorno.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1" },
        data: { enBuildTime: true },
      }),
    );
    expect(result.enBuildTime).toBe(true);
  });

  it("desactiva enBuildTime en la variable", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.update).mockResolvedValue({
      id: "v1",
      clave: "DATABASE_URL",
      enBuildTime: false,
      creadoEn: new Date(),
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).variables.toggleBuildTime({
      id: "v1",
      enBuildTime: false,
    });

    expect(result.enBuildTime).toBe(false);
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.toggleBuildTime({
        id: "no-existe",
        enBuildTime: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("variables.listarConValores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve claves con valores descifrados", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      { ...mockVariable, clave: "API_KEY" },
      { ...mockVariable, clave: "DATABASE_URL" },
    ] as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.listarConValores({
      proyectoId: "p1",
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ clave: "API_KEY", valor: "valor-descifrado" });
    expect(descifrar).toHaveBeenCalledTimes(2);
  });

  it("devuelve array vacío si no hay variables", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.listarConValores({
      proyectoId: "p1",
    });
    expect(result).toEqual([]);
  });
});

describe("variables.sincronizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.variableEntorno.deleteMany).mockResolvedValue({
      count: 0,
    } as never);
    vi.mocked(prisma.variableEntorno.upsert).mockResolvedValue({
      id: "v1",
    } as never);
  });

  it("hace upsert de las variables válidas y elimina las ausentes", async () => {
    vi.mocked(prisma.variableEntorno.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.sincronizar({
      proyectoId: "p1",
      contenido: "API_KEY=secreto\nDATABASE_URL=postgres://localhost/db",
    });
    expect(prisma.variableEntorno.deleteMany).toHaveBeenCalledWith({
      where: {
        proyectoId: "p1",
        clave: { notIn: ["API_KEY", "DATABASE_URL"] },
      },
    });
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ guardadas: 2, eliminadas: 1, invalidas: [] });
  });

  it("elimina todas las variables si el contenido está vacío", async () => {
    vi.mocked(prisma.variableEntorno.deleteMany).mockResolvedValue({
      count: 3,
    } as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.sincronizar({
      proyectoId: "p1",
      contenido: "",
    });
    expect(prisma.variableEntorno.deleteMany).toHaveBeenCalledWith({
      where: { proyectoId: "p1", clave: { notIn: [] } },
    });
    expect(prisma.variableEntorno.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ guardadas: 0, eliminadas: 3, invalidas: [] });
  });

  it("ignora comentarios y devuelve inválidas", async () => {
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.sincronizar({
      proyectoId: "p1",
      contenido: "# comentario\nVALID_KEY=ok\nnombre_invalido=x",
    });
    expect(result.guardadas).toBe(1);
    expect(result.invalidas).toEqual(["nombre_invalido"]);
  });

  it("preserva líneas con = en el valor (DATABASE_URL con credenciales)", async () => {
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.sincronizar({
      proyectoId: "p1",
      contenido: "DATABASE_URL=postgres://user:pass@host/db?sslmode=require",
    });
    expect(result.guardadas).toBe(1);
    expect(prisma.variableEntorno.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clave: "DATABASE_URL",
        }),
      }),
    );
  });

  it("lanza BAD_REQUEST si una línea válida contiene un retorno de carro suelto en el valor", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.sincronizar({
        proyectoId: "p1",
        // "\r" a mitad de línea sobrevive al split("\n") + trim() de parsearDotEnv,
        // así que llega íntegro a valorSchema y debe rechazarse ahí.
        contenido: "API_KEY=abc\rdef",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.variableEntorno.upsert).not.toHaveBeenCalled();
  });
});
