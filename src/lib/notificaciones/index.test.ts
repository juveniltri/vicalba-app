import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindUnique,
  mockEnviarWebhook,
  mockEnviarEmail,
  mockEnviarTelegram,
  mockDescifrar,
} = vi.hoisted(() => ({
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

import { enviarNotificacion } from "./index";

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
  telegramBotToken: null,
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

  it("un canal fallido no cancela los otros (Promise.allSettled)", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
      telegramHabilitado: true,
      telegramBotToken: "token",
      telegramChatId: "chat",
    });
    mockEnviarWebhook.mockRejectedValue(new Error("webhook falló"));

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).toHaveBeenCalledOnce();
    expect(mockEnviarTelegram).toHaveBeenCalledOnce();
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
