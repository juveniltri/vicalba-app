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

  it("no lanza si fetch falla", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      enviarWebhook("https://hooks.ejemplo.com/notify", payload),
    ).resolves.not.toThrow();
  });
});
