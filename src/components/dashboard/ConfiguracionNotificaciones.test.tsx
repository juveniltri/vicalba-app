// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfiguracionNotificaciones } from "./ConfiguracionNotificaciones";

vi.mock("@/app/(panel)/actions", () => ({
  guardarWebhookAction: vi.fn().mockResolvedValue(undefined),
  guardarEmailAction: vi.fn().mockResolvedValue(undefined),
  guardarTelegramAction: vi.fn().mockResolvedValue(undefined),
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
});
