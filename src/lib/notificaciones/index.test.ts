import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindUnique,
  mockEnviarWebhook,
  mockEnviarEmail,
  mockEnviarTelegram,
  mockDescifrar,
  mockLogError,
  mockLogWarn,
} = vi.hoisted(() => ({
  mockLogError: vi.fn(),
  mockLogWarn: vi.fn(),
  mockFindUnique: vi.fn(),
  mockEnviarWebhook: vi.fn().mockResolvedValue(undefined),
  mockEnviarEmail: vi.fn().mockResolvedValue(undefined),
  mockEnviarTelegram: vi.fn().mockResolvedValue(undefined),
  mockDescifrar: vi.fn().mockReturnValue("plainpass"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionNotificacion: { findUnique: mockFindUnique },
  },
}));
vi.mock("./webhook", () => ({ enviarWebhook: mockEnviarWebhook }));
vi.mock("./email", () => ({ enviarEmail: mockEnviarEmail }));
vi.mock("./telegram", () => ({ enviarTelegram: mockEnviarTelegram }));
vi.mock("@/lib/crypto", () => ({ descifrar: mockDescifrar }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: mockLogError, warn: mockLogWarn }) },
}));

import { enviarEmailDePrueba, enviarNotificacion } from "./index";

const configBase = {
  id: "default",
  webhookHabilitado: false,
  webhookUrl: null,
  emailHabilitado: false,
  emailSmtpHost: null,
  emailSmtpPort: null,
  emailSmtpUser: null,
  emailSmtpPass: null,
  emailSmtpPassIv: null,
  emailSmtpPassTag: null,
  emailRemitente: null,
  emailDestinatario: null,
  telegramHabilitado: false,
  telegramBotTokenCifrado: null,
  telegramBotTokenIv: null,
  telegramBotTokenTag: null,
  telegramChatId: null,
};

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123" as string | null,
  resultado: "exito" as const,
  output: "Build OK",
};

describe("enviarNotificacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarWebhook.mockResolvedValue(undefined);
    mockEnviarEmail.mockResolvedValue(undefined);
    mockEnviarTelegram.mockResolvedValue(undefined);
    mockDescifrar.mockReturnValue("plainpass");
  });

  it("no hace nada si no existe config en BD", async () => {
    mockFindUnique.mockResolvedValue(null);

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).not.toHaveBeenCalled();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockEnviarTelegram).not.toHaveBeenCalled();
  });

  it("solo llama a los canales habilitados", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
      telegramHabilitado: false,
    });

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).toHaveBeenCalledOnce();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockEnviarTelegram).not.toHaveBeenCalled();
  });

  it("registra en el log el canal que falla y el motivo", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      emailHabilitado: true,
      emailSmtpHost: "smtp.ejemplo.com",
      emailSmtpPort: 465,
      emailSmtpUser: "u",
      emailSmtpPass: "enc",
      emailSmtpPassIv: "iv",
      emailSmtpPassTag: "tag",
      emailRemitente: "panel@ejemplo.com",
      emailDestinatario: "equipo@ejemplo.com",
    });
    mockEnviarEmail.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await enviarNotificacion(payload);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ canal: "email", err: "connect ETIMEDOUT" }),
      expect.any(String),
    );
  });

  it("avisa en el log si el email está habilitado pero incompleto", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      emailHabilitado: true,
      emailSmtpHost: "smtp.ejemplo.com",
    });

    await enviarNotificacion(payload);

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        canal: "email",
        faltan: expect.arrayContaining(["puerto", "destinatario"]),
      }),
      expect.any(String),
    );
  });

  it("registra el error si no se puede leer la configuración", async () => {
    mockFindUnique.mockRejectedValue(new Error("db caída"));

    await enviarNotificacion(payload);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ err: "db caída" }),
      expect.any(String),
    );
  });

  it("registra como texto un fallo de configuración que no es Error", async () => {
    mockFindUnique.mockRejectedValue("sin conexión");

    await enviarNotificacion(payload);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ err: "sin conexión" }),
      expect.any(String),
    );
  });

  it("registra rechazos que no son Error como texto", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
    });
    mockEnviarWebhook.mockRejectedValue("503");

    await enviarNotificacion(payload);

    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ canal: "webhook", err: "503" }),
      expect.any(String),
    );
  });

  it("un canal fallido no cancela los otros (Promise.allSettled)", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
      telegramHabilitado: true,
      telegramBotTokenCifrado: "enc-tok",
      telegramBotTokenIv: "iv-tok",
      telegramBotTokenTag: "tag-tok",
      telegramChatId: "chat",
    });
    mockDescifrar.mockReturnValue("plain-token");
    mockEnviarWebhook.mockRejectedValue(new Error("webhook falló"));

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).toHaveBeenCalledOnce();
    expect(mockEnviarTelegram).toHaveBeenCalledOnce();
  });

  it("descifra el token de Telegram antes de llamar a enviarTelegram", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      telegramHabilitado: true,
      telegramBotTokenCifrado: "enc-tok",
      telegramBotTokenIv: "iv-tok",
      telegramBotTokenTag: "tag-tok",
      telegramChatId: "chat-123",
    });
    mockDescifrar.mockReturnValue("plain-token");

    await enviarNotificacion(payload);

    expect(mockDescifrar).toHaveBeenCalledWith("enc-tok", "iv-tok", "tag-tok");
    expect(mockEnviarTelegram).toHaveBeenCalledWith(
      "plain-token",
      "chat-123",
      payload,
    );
  });

  it("nunca lanza aunque todos los canales fallen", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
    });
    mockEnviarWebhook.mockRejectedValue(new Error("fallo total"));

    await expect(enviarNotificacion(payload)).resolves.not.toThrow();
  });

  it("descifra la contraseña SMTP antes de llamar a enviarEmail", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      emailHabilitado: true,
      emailSmtpHost: "smtp.ejemplo.com",
      emailSmtpPort: 587,
      emailSmtpUser: "user@ejemplo.com",
      emailSmtpPass: "enc",
      emailSmtpPassIv: "iv",
      emailSmtpPassTag: "tag",
      emailRemitente: "panel@vicalba.com",
      emailDestinatario: "admin@cliente.com",
    });

    await enviarNotificacion(payload);

    expect(mockDescifrar).toHaveBeenCalledWith("enc", "iv", "tag");
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPass: "plainpass" }),
      payload,
    );
  });
});

describe("enviarEmailDePrueba", () => {
  const configEmail = {
    ...configBase,
    emailHabilitado: true,
    emailSmtpHost: "smtp.ejemplo.com",
    emailSmtpPort: 465,
    emailSmtpUser: "u",
    emailSmtpPass: "enc",
    emailSmtpPassIv: "iv",
    emailSmtpPassTag: "tag",
    emailRemitente: "panel@ejemplo.com",
    emailDestinatario: "equipo@ejemplo.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarEmail.mockResolvedValue(undefined);
    mockDescifrar.mockReturnValue("plainpass");
  });

  it("envía un correo de prueba con la configuración guardada", async () => {
    mockFindUnique.mockResolvedValue(configEmail);

    await expect(enviarEmailDePrueba()).resolves.toEqual({ ok: true });
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: 465, smtpPass: "plainpass" }),
      expect.objectContaining({ proyectoNombre: "prueba" }),
    );
  });

  it("devuelve el error real del servidor SMTP", async () => {
    mockFindUnique.mockResolvedValue(configEmail);
    mockEnviarEmail.mockRejectedValue(
      new Error("connect ETIMEDOUT 1.2.3.4:465"),
    );

    await expect(enviarEmailDePrueba()).resolves.toEqual({
      ok: false,
      error: "connect ETIMEDOUT 1.2.3.4:465",
    });
  });

  it("avisa si nunca se ha guardado configuración", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(enviarEmailDePrueba()).resolves.toMatchObject({ ok: false });
  });

  it("convierte a texto rechazos que no son Error", async () => {
    mockFindUnique.mockResolvedValue(configEmail);
    mockEnviarEmail.mockRejectedValue("timeout");

    await expect(enviarEmailDePrueba()).resolves.toEqual({
      ok: false,
      error: "timeout",
    });
  });

  it("lista todos los campos cuando no hay ninguno configurado", async () => {
    mockFindUnique.mockResolvedValue({ ...configBase, emailHabilitado: true });

    const res = await enviarEmailDePrueba();

    expect(!res.ok && res.error).toBe(
      "Configuración incompleta, falta: servidor SMTP, puerto, usuario SMTP, contraseña SMTP, remitente, destinatario",
    );
  });

  it("considera ausente una contraseña SMTP con el cifrado incompleto", async () => {
    mockFindUnique.mockResolvedValue({ ...configEmail, emailSmtpPassIv: null });

    const res = await enviarEmailDePrueba();

    expect(!res.ok && res.error).toMatch(/falta: contraseña SMTP$/);
  });

  it("indica qué campos faltan si la configuración está incompleta", async () => {
    mockFindUnique.mockResolvedValue({
      ...configEmail,
      emailSmtpPass: null,
      emailDestinatario: null,
    });

    const res = await enviarEmailDePrueba();

    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/contraseña SMTP.*destinatario/);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });
});
