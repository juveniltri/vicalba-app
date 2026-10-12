-- CreateEnum
CREATE TYPE "OrigenDeploy" AS ENUM ('manual', 'webhook', 'rollback');

-- AlterTable
ALTER TABLE "Deploy" ADD COLUMN     "origen" "OrigenDeploy" NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "ConfiguracionNotificacion" ADD COLUMN     "emailUltimoEnvioEn" TIMESTAMP(3),
ADD COLUMN     "emailUltimoError" TEXT,
ADD COLUMN     "telegramUltimoEnvioEn" TIMESTAMP(3),
ADD COLUMN     "telegramUltimoError" TEXT,
ADD COLUMN     "webhookUltimoEnvioEn" TIMESTAMP(3),
ADD COLUMN     "webhookUltimoError" TEXT;
