-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "autoDeployHabilitado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rama" TEXT NOT NULL DEFAULT 'main',
ADD COLUMN     "repositorioUrl" TEXT;
