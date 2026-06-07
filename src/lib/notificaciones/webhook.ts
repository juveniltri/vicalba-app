import type { PayloadNotificacion } from "./index";

export async function enviarWebhook(
  url: string,
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // absorb
  }
}
