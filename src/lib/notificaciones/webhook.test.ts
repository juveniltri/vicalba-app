import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { enviarWebhook } from "./webhook";

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "exito" as const,
  output: "Build completado",
};

describe("enviarWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hace POST al URL con el payload completo como JSON", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await enviarWebhook("https://hooks.ejemplo.com/notify", payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.ejemplo.com/notify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("propaga el error de red para registrarlo como fallo del canal", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      enviarWebhook("https://hooks.ejemplo.com/notify", payload),
    ).rejects.toThrow("network error");
  });

  it("falla si el destino responde con un código no 2xx, sin exponer la URL", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    const error = await enviarWebhook(
      "https://discord.com/api/webhooks/1/secret-token",
      payload,
    ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("El webhook respondió 404");
  });
});
