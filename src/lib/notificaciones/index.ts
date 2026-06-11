import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enviarEmail } from "./email";
import { enviarTelegram } from "./telegram";
import { enviarWebhook } from "./webhook";

export interface PayloadNotificacion {
  proyectoNombre: string;
  clienteSlug: string;
  rama: string;
  sha: string | null;
  resultado: "exito" | "error";
  output: string;
}

export async function enviarNotificacion(
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return;

    const promesas: Promise<void>[] = [];

    if (config.webhookHabilitado && config.webhookUrl) {
      promesas.push(enviarWebhook(config.webhookUrl, payload));
    }

    if (
      config.emailHabilitado &&
      config.emailSmtpHost &&
      config.emailSmtpPort &&
      config.emailSmtpUser &&
      config.emailSmtpPass &&
      config.emailSmtpPassIv &&
      config.emailSmtpPassTag &&
      config.emailRemitente &&
      config.emailDestinatario
    ) {
      const smtpPass = descifrar(
        config.emailSmtpPass,
        config.emailSmtpPassIv,
        config.emailSmtpPassTag,
      );
      promesas.push(
        enviarEmail(
          {
            smtpHost: config.emailSmtpHost,
            smtpPort: config.emailSmtpPort,
            smtpUser: config.emailSmtpUser,
            smtpPass,
            remitente: config.emailRemitente,
            destinatario: config.emailDestinatario,
          },
          payload,
        ),
      );
    }

    if (
      config.telegramHabilitado &&
      config.telegramBotTokenCifrado &&
      config.telegramBotTokenIv &&
      config.telegramBotTokenTag &&
      config.telegramChatId
    ) {
      const botToken = descifrar(
        config.telegramBotTokenCifrado,
        config.telegramBotTokenIv,
        config.telegramBotTokenTag,
      );
      promesas.push(enviarTelegram(botToken, config.telegramChatId, payload));
    }

    await Promise.allSettled(promesas);
  } catch {
    // absorb
  }
}
