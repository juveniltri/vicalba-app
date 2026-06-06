import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { enviarTelegram } from "./telegram";

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "error" as const,
  output: Array.from({ length: 30 }, (_, i) => `Línea ${i + 1}`).join("\n"),
};

describe("enviarTelegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  it("hace fetch a la API de Telegram con el token y chatId correctos", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-123/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("chat-456"),
      }),
    );
  });

  it("incluye resultado, proyecto y rama en el mensaje", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { chat_id: string; text: string };
    expect(body.text).toContain("error");
    expect(body.text).toContain("web-app");
    expect(body.text).toContain("main");
  });

  it("trunca el output a las últimas 20 líneas", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { text: string };
    expect(body.text).toContain("Línea 30");
    expect(body.text).not.toContain("Línea 10");
  });

  it("muestra '—' cuando sha es null", async () => {
    await enviarTelegram("bot-token-123", "chat-456", {
      ...payload,
      sha: null,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { text: string };
    expect(body.text).toContain("SHA: —");
  });

  it("usa emoji ✅ cuando resultado es exito", async () => {
    await enviarTelegram("bot-token-123", "chat-456", {
      ...payload,
      resultado: "exito" as const,
    });

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { text: string };
    expect(body.text).toContain("✅");
  });

  it("no lanza si fetch falla", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      enviarTelegram("bot-token-123", "chat-456", payload),
    ).resolves.not.toThrow();
  });
});
