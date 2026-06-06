-- CreateEnum
CREATE TYPE "ResultadoDeploy" AS ENUM ('en_curso', 'exito', 'error');

-- CreateTable
CREATE TABLE "Deploy" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "rama" TEXT NOT NULL,
    "resultado" "ResultadoDeploy" NOT NULL DEFAULT 'en_curso',
    "output" TEXT,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),

    CONSTRAINT "Deploy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deploy_proyectoId_iniciadoEn_idx" ON "Deploy"("proyectoId", "iniciadoEn" DESC);

-- AddForeignKey
ALTER TABLE "Deploy" ADD CONSTRAINT "Deploy_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
