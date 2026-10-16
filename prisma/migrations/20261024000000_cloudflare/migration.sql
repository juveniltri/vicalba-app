-- AlterTable
ALTER TABLE "ConfiguracionProxy" ADD COLUMN     "cfTokenAuthTag" TEXT,
ADD COLUMN     "cfTokenCifrado" TEXT,
ADD COLUMN     "cfTokenIv" TEXT;

-- AlterTable
ALTER TABLE "RutaProyecto" ADD COLUMN     "cloudflare" BOOLEAN NOT NULL DEFAULT false;
