import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockSendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

import { enviarEmail } from "./email";

const smtpConfig = {
  smtpHost: "smtp.ejemplo.com",
  smtpPort: 587,
  smtpUser: "user@ejemplo.com",
  smtpPass: "supersecret",
  remitente: "panel@vicalba.com",
  destinatario: "admin@cliente.com",
};

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "exito" as const,
  output: Array.from({ length: 60 }, (_, i) => `Línea ${i + 1}`).join("\n"),
};

describe("enviarEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({});
  });

  it("crea transporte nodemailer con los parámetros SMTP correctos", async () => {
    await enviarEmail(smtpConfig, payload);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.ejemplo.com",
        port: 587,
        secure: false,
        auth: { user: "user@ejemplo.com", pass: "supersecret" },
      }),
    );
  });

  it("usa TLS implícito (secure) en el puerto 465", async () => {
    await enviarEmail({ ...smtpConfig, smtpPort: 465 }, payload);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("falla rápido si el servidor SMTP no responde (puerto bloqueado)", async () => {
    await enviarEmail(smtpConfig, payload);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 10_000 }),
    );
  });

  it("incluye resultado y nombre del proyecto en el asunto", async () => {
    await enviarEmail(smtpConfig, payload);

    const mailOptions = mockSendMail.mock.calls[0][0] as {
      subject: string;
      text: string;
    };
    expect(mailOptions.subject).toContain("exito");
    expect(mailOptions.subject).toContain("web-app");
  });

  it("trunca el output a las últimas 50 líneas en el cuerpo", async () => {
    await enviarEmail(smtpConfig, payload);

    const mailOptions = mockSendMail.mock.calls[0][0] as { text: string };
    expect(mailOptions.text).toContain("Línea 60");
    expect(mailOptions.text).not.toContain("Línea 10");
  });

  it("muestra '—' en el cuerpo cuando sha es null", async () => {
    await enviarEmail(smtpConfig, { ...payload, sha: null });

    const mailOptions = mockSendMail.mock.calls[0][0] as { text: string };
    expect(mailOptions.text).toContain("SHA: —");
  });

  it("propaga el error del SMTP para poder registrarlo y mostrarlo", async () => {
    mockSendMail.mockRejectedValue(new Error("535 Authentication failed"));

    await expect(enviarEmail(smtpConfig, payload)).rejects.toThrow(
      "535 Authentication failed",
    );
  });
});

describe("enviarEmail — avisos de backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({});
  });

  it("titula «Backup» los avisos de backup", async () => {
    await enviarEmail(smtpConfig, {
      ...payload,
      proyectoNombre: "panel",
      evento: "backup",
      resultado: "error",
    });
    const { subject } = mockSendMail.mock.calls[0][0] as { subject: string };
    expect(subject).toBe("[vicalba] Backup error — panel");
  });
});
