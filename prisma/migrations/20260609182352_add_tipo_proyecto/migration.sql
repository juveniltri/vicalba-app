-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('compose', 'dockerfile', 'image', 'nodejs');

-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "puerto" INTEGER,
ADD COLUMN     "tipo" "TipoProyecto" NOT NULL DEFAULT 'compose';
