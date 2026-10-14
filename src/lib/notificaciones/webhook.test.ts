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

  it("incluye en el error la explicación que devuelve el destino", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        '{"message": "Cannot send an empty message", "code": 50006}',
    });

    await expect(
      enviarWebhook("https://discord.com/api/webhooks/1/secret-token", payload),
    ).rejects.toThrow("El webhook respondió 400: Cannot send an empty message");
  });

  it("si la explicación no es JSON usa el texto, recortado", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => `no_text${" x".repeat(300)}`,
    });

    const error = (await enviarWebhook(
      "https://hooks.slack.com/services/T/B/secret",
      payload,
    ).catch((e: Error) => e)) as Error;

    expect(error.message.startsWith("El webhook respondió 400: no_text")).toBe(
      true,
    );
    expect(error.message.length).toBeLessThan(260);
  });
});

function cuerpoEnviado() {
  return JSON.parse(
    (mockFetch.mock.calls[0]![1] as { body: string }).body,
  ) as Record<string, unknown>;
}

describe("enviarWebhook — formato según el destino", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it.each([
    "https://discord.com/api/webhooks/1/token",
    "https://discordapp.com/api/webhooks/1/token",
    "https://ptb.discord.com/api/webhooks/1/token",
  ])("a Discord (%s) le envía un embed que pueda mostrar", async (url) => {
    await enviarWebhook(url, payload);

    const [embed] = cuerpoEnviado().embeds as Array<{
      title: string;
      color: number;
      fields: Array<{ name: string; value: string }>;
    }>;
    expect(embed!.title).toBe("✅ Deploy exito — acme / web-app");
    expect(embed!.color).toBe(0x22c55e);
    expect(embed!.fields).toEqual([
      { name: "Rama", value: "main", inline: true },
      { name: "Commit", value: "abc123", inline: true },
    ]);
  });

  it.each([
    ["error", "❌", 0xef4444],
    ["cancelado", "⏱️", 0x9ca3af],
  ] as const)(
    "en Discord, un deploy %s lleva su icono y color",
    async (resultado, icono, color) => {
      await enviarWebhook("https://discord.com/api/webhooks/1/t", {
        ...payload,
        resultado,
        sha: null,
      });

      const [embed] = cuerpoEnviado().embeds as Array<{
        title: string;
        color: number;
        fields: Array<{ value: string }>;
      }>;
      expect(embed!.title.startsWith(`${icono} Deploy ${resultado}`)).toBe(
        true,
      );
      expect(embed!.color).toBe(color);
      expect(embed!.fields[1]!.value).toBe("—");
    },
  );

  it("en Discord el log va en un bloque de código con las últimas 20 líneas, dentro del límite", async () => {
    const output = Array.from(
      { length: 50 },
      (_, i) => `línea ${i + 1} ${"x".repeat(300)} \`\`\``,
    ).join("\n");

    await enviarWebhook("https://discord.com/api/webhooks/1/t", {
      ...payload,
      output,
    });

    const [embed] = cuerpoEnviado().embeds as Array<{ description: string }>;
    const descripcion = embed!.description;
    expect(descripcion.startsWith("```\n")).toBe(true);
    expect(descripcion.endsWith("\n```")).toBe(true);
    expect(descripcion).toContain("línea 50 ");
    expect(descripcion).not.toContain("línea 30 ");
    // Discord rejects embeds whose description exceeds 4096 characters.
    expect(descripcion.length).toBeLessThanOrEqual(4096);
    // A ``` inside the log would close the code block early.
    expect(descripcion.slice(4, -4)).not.toContain("```");
  });

  it("a Slack le envía un texto", async () => {
    await enviarWebhook("https://hooks.slack.com/services/T/B/secret", payload);

    expect(cuerpoEnviado()).toEqual({
      text: "✅ Deploy exito — acme / web-app\nRama: main · Commit: abc123",
    });
  });
});

describe("enviarWebhook — casos límite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("con una URL que no se puede analizar envía el JSON genérico", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await enviarWebhook("no-es-una-url", payload);
    expect(cuerpoEnviado()).toEqual(payload);
  });

  it("en Discord, sin salida del deploy no añade bloque de log", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await enviarWebhook("https://discord.com/api/webhooks/1/t", {
      ...payload,
      output: "  ",
    });
    const [embed] = cuerpoEnviado().embeds as Array<Record<string, unknown>>;
    expect(embed).not.toHaveProperty("description");
  });

  it.each([
    ["sin cuerpo", ""],
    ["JSON sin message", '{"error": "bad"}'],
  ])("error con respuesta %s", async (_caso, texto) => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => texto,
    });
    const error = (await enviarWebhook(
      "https://hooks.ejemplo.com/notify",
      payload,
    ).catch((e: Error) => e)) as Error;
    expect(error.message).toBe(
      texto ? `El webhook respondió 400: ${texto}` : "El webhook respondió 400",
    );
  });
});

it("a Slack, sin commit conocido muestra un guion", async () => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
  await enviarWebhook("https://hooks.slack.com/services/T/B/secret", {
    ...payload,
    sha: null,
  });
  expect(cuerpoEnviado().text).toContain("Commit: —");
});

describe("enviarWebhook — avisos de backup", () => {
  const backup = {
    ...payload,
    evento: "backup" as const,
    proyectoNombre: "panel",
    clienteSlug: "backups",
    resultado: "error" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it("titula «Backup» el embed de Discord", async () => {
    await enviarWebhook("https://discord.com/api/webhooks/1/t", backup);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.embeds[0].title).toBe("❌ Backup error — backups / panel");
  });

  it("titula «Backup» el texto de Slack", async () => {
    await enviarWebhook("https://hooks.slack.com/services/T/B/secret", backup);
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    );
    expect(body.text.split("\n")[0]).toBe("❌ Backup error — backups / panel");
  });
});
