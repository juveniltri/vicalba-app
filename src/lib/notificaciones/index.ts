import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enviarEmail } from "./email";
import { enviarTelegram } from "./telegram";
import { enviarWebhook } from "./webhook";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "notificaciones" });

export interface PayloadNotificacion {
  proyectoNombre: string;
  clienteSlug: string;
  rama: string;
  sha: string | null;
  resultado: "exito" | "error" | "cancelado";
  output: string;
}

type ConfigNotificacion = NonNullable<
  Awaited<ReturnType<typeof prisma.configuracionNotificacion.findUnique>>
>;

type ConfigEmailResuelta =
  | { ok: true; smtp: Parameters<typeof enviarEmail>[0] }
  | { ok: false; faltan: string[] };

function resolverConfigEmail(config: ConfigNotificacion): ConfigEmailResuelta {
  const {
    emailSmtpHost: smtpHost,
    emailSmtpPort: smtpPort,
    emailSmtpUser: smtpUser,
    emailSmtpPass,
    emailSmtpPassIv,
    emailSmtpPassTag,
    emailRemitente: remitente,
    emailDestinatario: destinatario,
  } = config;

  if (
    !smtpHost ||
    !smtpPort ||
    !smtpUser ||
    !emailSmtpPass ||
    !emailSmtpPassIv ||
    !emailSmtpPassTag ||
    !remitente ||
    !destinatario
  ) {
    const faltan = [
      !smtpHost && "servidor SMTP",
      !smtpPort && "puerto",
      !smtpUser && "usuario SMTP",
      ![emailSmtpPass, emailSmtpPassIv, emailSmtpPassTag].every(Boolean) &&
        "contraseña SMTP",
      !remitente && "remitente",
      !destinatario && "destinatario",
    ].filter((c): c is string => !!c);
    return { ok: false, faltan };
  }

  return {
    ok: true,
    smtp: {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass: descifrar(emailSmtpPass, emailSmtpPassIv, emailSmtpPassTag),
      remitente,
      destinatario,
    },
  };
}

export async function enviarEmailDePrueba(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const config = await prisma.configuracionNotificacion.findUnique({
    where: { id: "default" },
  });
  if (!config) {
    return { ok: false, error: "No hay configuración de email guardada" };
  }

  const email = resolverConfigEmail(config);
  if (!email.ok) {
    return {
      ok: false,
      error: `Configuración incompleta, falta: ${email.faltan.join(", ")}`,
    };
  }

  try {
    await enviarEmail(email.smtp, {
      proyectoNombre: "prueba",
      clienteSlug: "panel",
      rama: "—",
      sha: null,
      resultado: "exito",
      output: "Correo de prueba enviado desde el Panel.",
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function enviarNotificacion(
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return;

    const promesas: Array<{ canal: string; envio: Promise<void> }> = [];

    if (config.webhookHabilitado && config.webhookUrl) {
      promesas.push({
        canal: "webhook",
        envio: enviarWebhook(config.webhookUrl, payload),
      });
    }

    if (config.emailHabilitado) {
      const email = resolverConfigEmail(config);
      if (email.ok) {
        promesas.push({
          canal: "email",
          envio: enviarEmail(email.smtp, payload),
        });
      } else {
        log.warn(
          { canal: "email", faltan: email.faltan },
          "Email habilitado pero con configuración incompleta",
        );
      }
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
      promesas.push({
        canal: "telegram",
        envio: enviarTelegram(botToken, config.telegramChatId, payload),
      });
    }

    if (promesas.length === 0) return;

    const resultados = await Promise.allSettled(promesas.map((p) => p.envio));
    const ahora = new Date();
    const estado: Record<string, Date | string | null> = {};
    resultados.forEach((r, i) => {
      const canal = promesas[i].canal;
      const error =
        r.status === "rejected"
          ? r.reason instanceof Error
            ? r.reason.message
            : String(r.reason)
          : null;
      estado[`${canal}UltimoEnvioEn`] = ahora;
      estado[`${canal}UltimoError`] = error;
      if (error) {
        log.error(
          { canal, proyecto: payload.proyectoNombre, err: error },
          "Notificación de deploy fallida",
        );
      }
    });
    await prisma.configuracionNotificacion.update({
      where: { id: "default" },
      data: estado,
    });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "Error preparando notificaciones de deploy",
    );
  }
}
