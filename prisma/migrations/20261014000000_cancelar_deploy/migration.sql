-- AlterEnum
ALTER TYPE "ResultadoDeploy" ADD VALUE 'cancelado';

-- CreateTable
CREATE TABLE "ConfiguracionDeploy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timeoutMinutos" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "ConfiguracionDeploy_pkey" PRIMARY KEY ("id")
);
