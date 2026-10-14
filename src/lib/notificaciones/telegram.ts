import type { PayloadNotificacion } from "./index";

export async function enviarTelegram(
  botToken: string,
  chatId: string,
  payload: PayloadNotificacion,
): Promise<void> {
  const lineas = payload.output.split("\n");
  const outputTruncado = lineas.slice(-20).join("\n");

  const emoji = { exito: "✅", error: "❌", cancelado: "⏱️" }[
    payload.resultado
  ];
  const titulo = payload.evento === "backup" ? "Backup" : "Deploy";
  const text = [
    `${emoji} ${titulo} ${payload.resultado} — ${payload.proyectoNombre}`,
    `Rama: ${payload.rama}`,
    `SHA: ${payload.sha ?? "—"}`,
    "",
    "Output (últimas 20 líneas):",
    outputTruncado,
  ].join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  if (!res.ok) {
    // Never include the request URL in the error: it carries the bot token.
    const detalle = await res
      .json()
      .then((b: { description?: string }) => b.description)
      .catch(() => undefined);
    throw new Error(
      `Telegram respondió ${res.status}${detalle ? `: ${detalle}` : ""}`,
    );
  }
}
