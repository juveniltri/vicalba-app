// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  guardarEmailAction,
  guardarTelegramAction,
  guardarWebhookAction,
  probarEmailAction,
} from "@/app/(panel)/actions";
import { ConfiguracionNotificaciones } from "./ConfiguracionNotificaciones";

vi.mock("@/app/(panel)/actions", () => ({
  guardarWebhookAction: vi.fn().mockResolvedValue(undefined),
  guardarEmailAction: vi.fn().mockResolvedValue(undefined),
  guardarTelegramAction: vi.fn().mockResolvedValue(undefined),
  probarEmailAction: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("ConfiguracionNotificaciones", () => {
  it("muestra los tres paneles de canal", () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.getByText(/webhook/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/telegram/i)).toBeInTheDocument();
  });

  it("toggle webhook habilita y muestra el campo URL", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/url del webhook/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /habilitar webhook/i });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/url del webhook/i)).toBeInTheDocument();
  });

  it("toggle email habilita y muestra los campos SMTP", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/smtp host/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /habilitar email/i });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/smtp host/i)).toBeInTheDocument();
  });

  it("toggle telegram habilita y muestra token y chatId", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/bot token/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", {
      name: /habilitar telegram/i,
    });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/bot token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/chat id/i)).toBeInTheDocument();
  });

  it("el botón Guardar de webhook llama a guardarWebhookAction", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    const botones = screen.getAllByRole("button", { name: /guardar/i });
    await userEvent.click(botones[0]);

    expect(guardarWebhookAction).toHaveBeenCalledWith(false, undefined);
  });

  it("el botón Guardar de email llama a guardarEmailAction", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    const botones = screen.getAllByRole("button", { name: /guardar/i });
    await userEvent.click(botones[1]);

    expect(guardarEmailAction).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ smtpPort: 587 }),
    );
  });

  it("muestra el error si guardar el email falla en el servidor", async () => {
    vi.mocked(guardarEmailAction).mockResolvedValueOnce({
      error: "Datos inválidos",
    });
    render(<ConfiguracionNotificaciones config={null} />);

    const botones = screen.getAllByRole("button", { name: /guardar/i });
    await userEvent.click(botones[1]);

    expect(await screen.findByText("Datos inválidos")).toBeInTheDocument();
    expect(screen.queryByText("Email guardado")).not.toBeInTheDocument();
  });

  it("Enviar prueba muestra el error real del servidor SMTP", async () => {
    vi.mocked(probarEmailAction).mockResolvedValueOnce({
      ok: false,
      error: "connect ETIMEDOUT 1.2.3.4:465",
    });
    render(<ConfiguracionNotificaciones config={null} />);

    await userEvent.click(
      screen.getByRole("button", { name: /enviar prueba/i }),
    );

    expect(
      await screen.findByText(/connect ETIMEDOUT 1\.2\.3\.4:465/),
    ).toBeInTheDocument();
  });

  it("Enviar prueba confirma cuando el correo sale", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    await userEvent.click(
      screen.getByRole("button", { name: /enviar prueba/i }),
    );

    expect(
      await screen.findByText(/correo de prueba enviado/i),
    ).toBeInTheDocument();
  });

  it("el botón Guardar de telegram llama a guardarTelegramAction", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    const botones = screen.getAllByRole("button", { name: /guardar/i });
    await userEvent.click(botones[2]);

    expect(guardarTelegramAction).toHaveBeenCalledWith(
      false,
      undefined,
      undefined,
    );
  });

  it("muestra indicador 'configurado' cuando telegramBotTokenConfigurado es true", () => {
    render(
      <ConfiguracionNotificaciones
        config={{
          webhookHabilitado: false,
          webhookUrl: null,
          emailHabilitado: false,
          emailSmtpHost: null,
          emailSmtpPort: null,
          emailSmtpUser: null,
          emailRemitente: null,
          emailDestinatario: null,
          telegramHabilitado: true,
          telegramBotTokenConfigurado: true,
          telegramChatId: null,
        }}
      />,
    );

    expect(screen.getByText("configurado")).toBeInTheDocument();
  });

  describe("estado de cada canal", () => {
    const configBase = {
      webhookHabilitado: false,
      webhookUrl: null,
      emailHabilitado: true,
      emailSmtpHost: "smtp.x.com",
      emailSmtpPort: 465,
      emailSmtpUser: "u",
      emailRemitente: "a@x.com",
      emailDestinatario: "b@x.com",
      telegramHabilitado: true,
      telegramBotTokenConfigurado: true,
      telegramChatId: "1",
    };
    const hace2h = new Date(Date.now() - 2 * 3_600_000);

    it("muestra el error del último envío fallido", () => {
      render(
        <ConfiguracionNotificaciones
          config={{
            ...configBase,
            estadoCanales: {
              email: {
                ultimoEnvioEn: hace2h,
                ultimoError: "connect ETIMEDOUT",
              },
              telegram: { ultimoEnvioEn: null, ultimoError: null },
              webhook: { ultimoEnvioEn: null, ultimoError: null },
            },
          }}
        />,
      );

      const email = screen.getByRole("region", { name: "Email" });
      expect(email).toHaveTextContent("Último envío falló");
      expect(email).toHaveTextContent("connect ETIMEDOUT");
    });

    it("indica que funciona si el último envío salió bien", () => {
      render(
        <ConfiguracionNotificaciones
          config={{
            ...configBase,
            estadoCanales: {
              email: { ultimoEnvioEn: null, ultimoError: null },
              telegram: { ultimoEnvioEn: hace2h, ultimoError: null },
              webhook: { ultimoEnvioEn: null, ultimoError: null },
            },
          }}
        />,
      );

      expect(
        screen.getByRole("region", { name: "Telegram" }),
      ).toHaveTextContent("Funcionando · hace 2h");
      expect(screen.getByRole("region", { name: "Email" })).toHaveTextContent(
        "Sin envíos todavía",
      );
      expect(screen.getByRole("region", { name: "Webhook" })).toHaveTextContent(
        "Desactivado",
      );
    });
  });
});
