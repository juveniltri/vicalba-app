-- CreateEnum
CREATE TYPE "EstadoProxy" AS ENUM ('aplicada', 'en_curso', 'revertida', 'error');

-- CreateTable
CREATE TABLE "ConfiguracionProxy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "aplicada" JSONB NOT NULL,
    "pendiente" JSONB,
    "estado" "EstadoProxy" NOT NULL DEFAULT 'aplicada',
    "mensaje" TEXT,
    "log" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionProxy_pkey" PRIMARY KEY ("id")
);
