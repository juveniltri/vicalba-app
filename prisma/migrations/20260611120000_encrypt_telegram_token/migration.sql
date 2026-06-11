-- AlterTable: replace plaintext telegramBotToken with AES-256-GCM encrypted fields
ALTER TABLE "ConfiguracionNotificacion" ADD COLUMN "telegramBotTokenCifrado" TEXT;
ALTER TABLE "ConfiguracionNotificacion" ADD COLUMN "telegramBotTokenIv"      TEXT;
ALTER TABLE "ConfiguracionNotificacion" ADD COLUMN "telegramBotTokenTag"     TEXT;
ALTER TABLE "ConfiguracionNotificacion" DROP COLUMN "telegramBotToken";
