import type { PayloadNotificacion } from "./index";

export async function enviarTelegram(
  botToken: string,
  chatId: string,
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const lineas = payload.output.split("\n");
    const outputTruncado = lineas.slice(-20).join("\n");

    const emoji = payload.resultado === "exito" ? "✅" : "❌";
    const text = [
      `${emoji} Deploy ${payload.resultado} — ${payload.proyectoNombre}`,
      `Rama: ${payload.rama}`,
      `SHA: ${payload.sha ?? "—"}`,
      "",
      "Output (últimas 20 líneas):",
      outputTruncado,
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // absorb
  }
}
