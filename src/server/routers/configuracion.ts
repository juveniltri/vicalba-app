import { cifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
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

export const configuracionRouter = router({
  obtener: protectedProcedure.query(async () => {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return null;
    return { ...config, emailSmtpPass: null };
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
        data.telegramBotToken = input.telegram.botToken ?? null;
        data.telegramChatId = input.telegram.chatId ?? null;
      }

      await prisma.configuracionNotificacion.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
    }),
});
