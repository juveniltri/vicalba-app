import nodemailer from "nodemailer";
import type { PayloadNotificacion } from "./index";

export async function enviarEmail(
  config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    remitente: string;
    destinatario: string;
  },
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    const lineas = payload.output.split("\n");
    const outputTruncado = lineas.slice(-50).join("\n");

    await transporter.sendMail({
      from: config.remitente,
      to: config.destinatario,
      subject: `[vicalba] Deploy ${payload.resultado} — ${payload.proyectoNombre}`,
      text: [
        `Proyecto: ${payload.proyectoNombre}`,
        `Cliente: ${payload.clienteSlug}`,
        `Rama: ${payload.rama}`,
        `SHA: ${payload.sha ?? "—"}`,
        `Resultado: ${payload.resultado}`,
        "",
        "Output (últimas 50 líneas):",
        outputTruncado,
      ].join("\n"),
    });
  } catch {
    // absorb
  }
}
