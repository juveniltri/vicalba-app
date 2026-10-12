import type { PayloadNotificacion } from "./index";

export async function enviarWebhook(
  url: string,
  payload: PayloadNotificacion,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // The URL is left out on purpose: Discord/Slack webhook URLs embed their token.
  if (!res.ok) throw new Error(`El webhook respondió ${res.status}`);
}
