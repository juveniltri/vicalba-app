import { cifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enviarEmailDePrueba } from "@/lib/notificaciones";
import { protectedProcedure, router } from "@/server/trpc";
import { z } from "zod";

const guardarInput = z.object({
  webhook: z
    .object({
      habilitado: z.boolean(),
      url: z.string().url().optional(),
    })
    .optional(),
  email: z
    .object({
      habilitado: z.boolean(),
      smtpHost: z.string().optional(),
      smtpPort: z.number().int().positive().optional(),
      smtpUser: z.string().optional(),
      smtpPass: z.string().optional(),
      remitente: z.string().optional(),
      destinatario: z.string().optional(),
    })
    .optional(),
  telegram: z
    .object({
      habilitado: z.boolean(),
      botToken: z.string().optional(),
      chatId: z.string().optional(),
    })
    .optional(),
});

export const TIMEOUT_DEPLOY_POR_DEFECTO = 30;

const timeoutMinutosSchema = z
  .number()
  .int()
  .refine((n) => n === 0 || (n >= 5 && n <= 180), {
    message: "El timeout debe ser 0 (sin límite) o entre 5 y 180 minutos",
  });

export const configuracionRouter = router({
  obtenerDeploys: protectedProcedure.query(async () => {
    const config = await prisma.configuracionDeploy.findUnique({
      where: { id: "default" },
    });
    return {
      timeoutMinutos: config?.timeoutMinutos ?? TIMEOUT_DEPLOY_POR_DEFECTO,
    };
  }),

  guardarDeploys: protectedProcedure
    .input(z.object({ timeoutMinutos: timeoutMinutosSchema }))
    .mutation(async ({ input }) => {
      await prisma.configuracionDeploy.upsert({
        where: { id: "default" },
        create: { id: "default", ...input },
        update: input,
      });
    }),

  obtener: protectedProcedure.query(async () => {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return null;
    return {
      id: config.id,
      webhookHabilitado: config.webhookHabilitado,
      webhookUrl: config.webhookUrl,
      emailHabilitado: config.emailHabilitado,
      emailSmtpHost: config.emailSmtpHost,
      emailSmtpPort: config.emailSmtpPort,
      emailSmtpUser: config.emailSmtpUser,
      emailSmtpPass: null,
      emailRemitente: config.emailRemitente,
      emailDestinatario: config.emailDestinatario,
      telegramHabilitado: config.telegramHabilitado,
      telegramBotTokenConfigurado: config.telegramBotTokenCifrado !== null,
      telegramChatId: config.telegramChatId,
      estadoCanales: {
        email: {
          ultimoEnvioEn: config.emailUltimoEnvioEn,
          ultimoError: config.emailUltimoError,
        },
        telegram: {
          ultimoEnvioEn: config.telegramUltimoEnvioEn,
          ultimoError: config.telegramUltimoError,
        },
        webhook: {
          ultimoEnvioEn: config.webhookUltimoEnvioEn,
          ultimoError: config.webhookUltimoError,
        },
      },
    };
  }),

  guardar: protectedProcedure
    .input(guardarInput)
    .mutation(async ({ input }) => {
      const data: Record<string, unknown> = {};

      if (input.webhook !== undefined) {
        data.webhookHabilitado = input.webhook.habilitado;
        data.webhookUrl = input.webhook.url ?? null;
      }

      if (input.email !== undefined) {
        data.emailHabilitado = input.email.habilitado;
        data.emailSmtpHost = input.email.smtpHost ?? null;
        data.emailSmtpPort = input.email.smtpPort ?? null;
        data.emailSmtpUser = input.email.smtpUser ?? null;
        data.emailRemitente = input.email.remitente ?? null;
        data.emailDestinatario = input.email.destinatario ?? null;
        if (input.email.smtpPass) {
          const { valorCifrado, iv, authTag } = cifrar(input.email.smtpPass);
          data.emailSmtpPass = valorCifrado;
          data.emailSmtpPassIv = iv;
          data.emailSmtpPassTag = authTag;
        }
      }

      if (input.telegram !== undefined) {
        data.telegramHabilitado = input.telegram.habilitado;
        if (input.telegram.botToken) {
          const { valorCifrado, iv, authTag } = cifrar(input.telegram.botToken);
          data.telegramBotTokenCifrado = valorCifrado;
          data.telegramBotTokenIv = iv;
          data.telegramBotTokenTag = authTag;
        }
        data.telegramChatId = input.telegram.chatId ?? null;
      }

      await prisma.configuracionNotificacion.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
    }),

  probarEmail: protectedProcedure.mutation(() => enviarEmailDePrueba()),
});
