-- CreateTable
CREATE TABLE "ConfiguracionNotificacion" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "webhookHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "emailHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "emailSmtpHost" TEXT,
    "emailSmtpPort" INTEGER,
    "emailSmtpUser" TEXT,
    "emailSmtpPass" TEXT,
    "emailSmtpPassIv" TEXT,
    "emailSmtpPassTag" TEXT,
    "emailRemitente" TEXT,
    "emailDestinatario" TEXT,
    "telegramHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotToken" TEXT,
    "telegramChatId" TEXT,

    CONSTRAINT "ConfiguracionNotificacion_pkey" PRIMARY KEY ("id")
);
