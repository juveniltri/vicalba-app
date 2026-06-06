-- CreateTable
CREATE TABLE "VariableEntorno" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valorCifrado" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariableEntorno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VariableEntorno_proyectoId_clave_key" ON "VariableEntorno"("proyectoId", "clave");

-- AddForeignKey
ALTER TABLE "VariableEntorno" ADD CONSTRAINT "VariableEntorno_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
