-- AlterTable
ALTER TABLE "Backup" ADD COLUMN     "proyectoId" TEXT,
ADD COLUMN     "proyectoNombre" TEXT;

-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "backupsHabilitados" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ElementoBackup" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "incluido" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElementoBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementoCopia" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "resultado" "ResultadoBackup" NOT NULL DEFAULT 'en_curso',
    "snapshotIds" TEXT[],
    "bytesAnadidos" BIGINT,
    "error" TEXT,

    CONSTRAINT "ElementoCopia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElementoBackup_proyectoId_clave_key" ON "ElementoBackup"("proyectoId", "clave");

-- CreateIndex
CREATE INDEX "ElementoCopia_backupId_idx" ON "ElementoCopia"("backupId");

-- CreateIndex
CREATE INDEX "Backup_proyectoId_iniciadoEn_idx" ON "Backup"("proyectoId", "iniciadoEn");

-- AddForeignKey
ALTER TABLE "ElementoBackup" ADD CONSTRAINT "ElementoBackup_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementoCopia" ADD CONSTRAINT "ElementoCopia_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "Backup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
