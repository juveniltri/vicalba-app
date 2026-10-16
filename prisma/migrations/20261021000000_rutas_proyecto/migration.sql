-- CreateEnum
CREATE TYPE "RedireccionWww" AS ENUM ('ninguna', 'a_raiz', 'a_www');

-- CreateTable
CREATE TABLE "RutaProyecto" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "servicio" TEXT,
    "puerto" INTEGER NOT NULL,
    "redireccionWww" "RedireccionWww" NOT NULL DEFAULT 'ninguna',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RutaProyecto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RutaProyecto_dominio_path_key" ON "RutaProyecto"("dominio", "path");

-- CreateIndex
CREATE INDEX "RutaProyecto_proyectoId_idx" ON "RutaProyecto"("proyectoId");

-- AddForeignKey
ALTER TABLE "RutaProyecto" ADD CONSTRAINT "RutaProyecto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each existing dominio becomes the Proyecto's first route. The old generator
-- defaulted to port 80 when the Proyecto had none. If two Proyectos shared a
-- dominio, only the oldest keeps it (the unique index would reject the rest).
INSERT INTO "RutaProyecto" ("id", "proyectoId", "dominio", "puerto", "creadoEn", "actualizadoEn")
SELECT DISTINCT ON (lower("dominio"))
    'mig' || md5("id" || "dominio"), "id", lower("dominio"), COALESCE("puerto", 80), "creadoEn", CURRENT_TIMESTAMP
FROM "Proyecto"
WHERE "dominio" IS NOT NULL AND "dominio" <> ''
ORDER BY lower("dominio"), "creadoEn";

-- AlterTable
ALTER TABLE "Proyecto" DROP COLUMN "dominio";
