import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockUpsert, mockCifrar } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
  mockCifrar: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionNotificacion: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/crypto", () => ({
  cifrar: mockCifrar,
}));

// Necesitamos también mockear los módulos que proyectos y otros routers importan
// para que _app.ts compile sin fallos de env vars en test
vi.mock("@/lib/docker/proyectos", () => ({
  iniciarProyecto: vi.fn(),
  detenerProyecto: vi.fn(),
  restartProyecto: vi.fn(),
  DockerError: class DockerError extends Error {},
}));
vi.mock("@/lib/traefik/config", () => ({
  generarConfigTraefik: vi.fn(),
  escribirConfigTraefik: vi.fn(),
  eliminarConfigTraefik: vi.fn(),
}));
vi.mock("@/lib/docker/deploy", () => ({
  deployProyecto: vi.fn(),
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
vi.mock("@/lib/notificaciones", () => ({
  enviarNotificacion: vi.fn(),
}));
vi.mock("@/lib/docker/deploys", () => ({
  ejecutarDeploy: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const configBD = {
  id: "default",
  webhookHabilitado: true,
  webhookUrl: "https://hooks.ejemplo.com",
  emailHabilitado: false,
  emailSmtpHost: null,
  emailSmtpPort: null,
  emailSmtpUser: null,
  emailSmtpPass: "enc-pass",
  emailSmtpPassIv: "iv",
  emailSmtpPassTag: "tag",
  emailRemitente: null,
  emailDestinatario: null,
  telegramHabilitado: false,
  telegramBotToken: null,
  telegramChatId: null,
};

describe("configuracion.obtener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve la config sin emailSmtpPass en claro", async () => {
    mockFindUnique.mockResolvedValue(configBD);

    const ctx = await createContext();
    const result = await createCaller(ctx).configuracion.obtener();

    expect(result).not.toBeNull();
    expect((result as { emailSmtpPass: unknown }).emailSmtpPass).toBeNull();
    expect((result as { webhookUrl: unknown }).webhookUrl).toBe(
      "https://hooks.ejemplo.com",
    );
  });

  it("devuelve null si no hay config en BD", async () => {
    mockFindUnique.mockResolvedValue(null);

    const ctx = await createContext();
    const result = await createCaller(ctx).configuracion.obtener();

    expect(result).toBeNull();
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).configuracion.obtener(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("configuracion.guardar — webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
  });

  it("hace upsert con los campos webhook correctos", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      webhook: { habilitado: true, url: "https://hooks.nuevo.com" },
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "default" },
        update: expect.objectContaining({
          webhookHabilitado: true,
          webhookUrl: "https://hooks.nuevo.com",
        }),
      }),
    );
  });

  it("no toca campos de email ni telegram al guardar solo webhook", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      webhook: { habilitado: false, url: undefined },
    });

    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(Object.keys(updateArg.update)).not.toContain("emailHabilitado");
    expect(Object.keys(updateArg.update)).not.toContain("telegramHabilitado");
  });
});

describe("configuracion.guardar — email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
    mockCifrar.mockReturnValue({
      valorCifrado: "enc",
      iv: "iv123",
      authTag: "tag123",
    });
  });

  it("cifra la contraseña SMTP antes de guardar", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      email: {
        habilitado: true,
        smtpHost: "smtp.ejemplo.com",
        smtpPort: 587,
        smtpUser: "user@ejemplo.com",
        smtpPass: "mysecretpass",
        remitente: "panel@vicalba.com",
        destinatario: "admin@cliente.com",
      },
    });

    expect(mockCifrar).toHaveBeenCalledWith("mysecretpass");
    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(updateArg.update.emailSmtpPass).toBe("enc");
    expect(updateArg.update.emailSmtpPassIv).toBe("iv123");
    expect(updateArg.update.emailSmtpPassTag).toBe("tag123");
  });

  it("no cifra si smtpPass no viene en el input", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      email: {
        habilitado: true,
        smtpHost: "smtp.ejemplo.com",
        // smtpPass ausente
      },
    });

    expect(mockCifrar).not.toHaveBeenCalled();
    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(Object.keys(updateArg.update)).not.toContain("emailSmtpPass");
  });
});

describe("configuracion.guardar — telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
  });

  it("hace upsert con los campos telegram correctos", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      telegram: {
        habilitado: true,
        botToken: "bot-token-xyz",
        chatId: "chat-123",
      },
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          telegramHabilitado: true,
          telegramBotToken: "bot-token-xyz",
          telegramChatId: "chat-123",
        }),
      }),
    );
  });

  it("guarda null cuando botToken y chatId no vienen", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      telegram: { habilitado: false },
    });

    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(updateArg.update.telegramBotToken).toBeNull();
    expect(updateArg.update.telegramChatId).toBeNull();
  });
});
