import type { PayloadNotificacion } from "./index";

const ICONO = { exito: "✅", error: "❌", cancelado: "⏱️" } as const;
// Embed side colour: green / red / grey.
const COLOR = {
  exito: 0x22c55e,
  error: 0xef4444,
  cancelado: 0x9ca3af,
} as const;
// Discord rejects the whole message if an embed description exceeds this.
const MAX_DESCRIPCION_DISCORD = 4096;
const LINEAS_LOG = 20;

type Destino = "discord" | "slack" | "generico";

// Discord and Slack answer 400 to anything that is not their own format, so
// the generic payload is kept only for custom endpoints.
function destinoDe(url: string): Destino {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "generico";
  }
  if (/(^|\.)discord(app)?\.com$/.test(host)) return "discord";
  if (host === "hooks.slack.com") return "slack";
  return "generico";
}

function titulo(p: PayloadNotificacion): string {
  const evento = p.evento === "backup" ? "Backup" : "Deploy";
  return `${ICONO[p.resultado]} ${evento} ${p.resultado} — ${p.clienteSlug} / ${p.proyectoNombre}`;
}

function bloqueLog(output: string): string {
  // A ``` inside the log would close the code block early.
  const log = output
    .split("\n")
    .slice(-LINEAS_LOG)
    .join("\n")
    .replaceAll("```", "'''");
  const max = MAX_DESCRIPCION_DISCORD - "```\n\n```".length;
  return `\`\`\`\n${log.length > max ? log.slice(-max) : log}\n\`\`\``;
}

function cuerpo(destino: Destino, p: PayloadNotificacion): unknown {
  if (destino === "slack") {
    return { text: `${titulo(p)}\nRama: ${p.rama} · Commit: ${p.sha ?? "—"}` };
  }
  if (destino === "discord") {
    return {
      embeds: [
        {
          title: titulo(p),
          color: COLOR[p.resultado],
          fields: [
            { name: "Rama", value: p.rama, inline: true },
            { name: "Commit", value: p.sha ?? "—", inline: true },
          ],
          ...(p.output.trim() ? { description: bloqueLog(p.output) } : {}),
        },
      ],
    };
  }
  return p;
}

// What the destination says is wrong ("Cannot send an empty message"…), so the
// error shown in Configuración explains itself.
async function explicacion(res: Response): Promise<string | null> {
  let texto: string;
  try {
    texto = (await res.text()).trim();
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    const json: unknown = JSON.parse(texto);
    if (
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof json.message === "string"
    )
      return json.message;
  } catch {
    // not JSON: fall back to the raw text
  }
  return texto.slice(0, 200);
}

export async function enviarWebhook(
  url: string,
  payload: PayloadNotificacion,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo(destinoDe(url), payload)),
  });
  // The URL is left out on purpose: Discord/Slack webhook URLs embed their token.
  if (!res.ok) {
    const motivo = await explicacion(res);
    throw new Error(
      `El webhook respondió ${res.status}${motivo ? `: ${motivo}` : ""}`,
    );
  }
}
