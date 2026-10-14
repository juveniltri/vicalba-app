-- CreateEnum
CREATE TYPE "DestinoBackup" AS ENUM ('s3', 'sftp');

-- CreateEnum
CREATE TYPE "OperacionBackup" AS ENUM ('copia', 'restauracion');

-- CreateEnum
CREATE TYPE "OrigenBackup" AS ENUM ('programado', 'manual', 'antes_de_restaurar');

-- CreateEnum
CREATE TYPE "ResultadoBackup" AS ENUM ('en_curso', 'exito', 'error');

-- CreateTable
CREATE TABLE "ConfiguracionBackup" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "habilitado" BOOLEAN NOT NULL DEFAULT false,
    "hora" INTEGER NOT NULL DEFAULT 3,
    "tipoDestino" "DestinoBackup",
    "s3Endpoint" TEXT,
    "s3Bucket" TEXT,
    "s3Region" TEXT,
    "s3Prefijo" TEXT,
    "s3AccessKeyId" TEXT,
    "s3SecretKeyCifrada" TEXT,
    "s3SecretKeyIv" TEXT,
    "s3SecretKeyTag" TEXT,
    "sftpHost" TEXT,
    "sftpPuerto" INTEGER NOT NULL DEFAULT 22,
    "sftpUsuario" TEXT,
    "sftpRuta" TEXT,
    "sftpCredencialId" TEXT,
    "claveCifrada" TEXT,
    "claveIv" TEXT,
    "claveTag" TEXT,
    "claveConfirmadaEn" TIMESTAMP(3),
    "repositorioInicializadoEn" TIMESTAMP(3),

    CONSTRAINT "ConfiguracionBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "operacion" "OperacionBackup" NOT NULL DEFAULT 'copia',
    "origen" "OrigenBackup" NOT NULL,
    "resultado" "ResultadoBackup" NOT NULL DEFAULT 'en_curso',
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),
    "snapshotId" TEXT,
    "bytesAnadidos" BIGINT,
    "error" TEXT,

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Backup_iniciadoEn_idx" ON "Backup"("iniciadoEn");

-- AddForeignKey
ALTER TABLE "ConfiguracionBackup" ADD CONSTRAINT "ConfiguracionBackup_sftpCredencialId_fkey" FOREIGN KEY ("sftpCredencialId") REFERENCES "Credencial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
