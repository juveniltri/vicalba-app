import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { iniciarCopia } from "./copia";
import { hayOperacionEnCurso } from "./operacion";
import { tocaCopia } from "./programacion";

const log = logger.child({ module: "backups" });
const global = globalThis as unknown as { programadorBackups?: NodeJS.Timeout };

export async function comprobarProgramacion(
  ahora = new Date(),
): Promise<boolean> {
  try {
    if (hayOperacionEnCurso()) return false;
    const config = await prisma.configuracionBackup.findUnique({
      where: { id: "default" },
    });
    if (
      !config?.habilitado ||
      !config.claveConfirmadaEn ||
      !config.repositorioInicializadoEn
    ) {
      return false;
    }
    const ultimo = await prisma.backup.findFirst({
      where: { operacion: "copia", origen: "programado" },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    if (!tocaCopia(ahora, config.hora, ultimo?.iniciadoEn ?? null))
      return false;
    await iniciarCopia("programado");
    return true;
  } catch (err) {
    log.error({ err }, "No se pudo lanzar la copia programada");
    return false;
  }
}

// The state lives in the database, so a restart neither skips nor repeats a day.
export function iniciarProgramador(): void {
  if (global.programadorBackups) return;
  global.programadorBackups = setInterval(
    () => void comprobarProgramacion(),
    60_000,
  );
}
