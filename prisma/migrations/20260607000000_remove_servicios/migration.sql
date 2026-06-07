-- DropTable
DROP TABLE "Servicio";

-- CreateIndex
CREATE UNIQUE INDEX "Proyecto_clienteId_nombre_key" ON "Proyecto"("clienteId", "nombre");
