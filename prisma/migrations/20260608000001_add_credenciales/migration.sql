CREATE TABLE "Credencial" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "clavePublica" TEXT NOT NULL,
  "clavePrivadaCifrada" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Credencial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Credencial_nombre_key" ON "Credencial"("nombre");

ALTER TABLE "Proyecto" ADD COLUMN "credencialId" TEXT;

ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_credencialId_fkey"
  FOREIGN KEY ("credencialId") REFERENCES "Credencial"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
