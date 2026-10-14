import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { leerFicheroTraefik } from "@/lib/docker/traefik";
import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import {
  LIMITE_MS,
  MOTIVO_LIMITE,
  motivoDeFallo,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";
import { pgDump } from "./postgres";
import type { ConfigResuelta } from "./repositorio";
import { aplicarRetencion, comprobarDestino, crearSnapshot } from "./restic";

const log = logger.child({ module: "backups" });

// Runs one backup into an existing Backup row. Used directly by the restore,
// which already holds the operation lock.
export async function hacerCopia(
  backupId: string,
  config: ConfigResuelta,
  signal: AbortSignal,
  { retencion = true }: { retencion?: boolean } = {},
): Promise<void> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "vicalba-backup-"));
  const dir = (...p: string[]) => path.posix.join(carpeta, ...p);
  try {
    await conRestic(config, signal, comprobarDestino);
    await pgDump(env.DATABASE_URL, dir("panel-db.dump"), signal);
    await mkdir(dir("traefik"), { recursive: true });
    await cp(env.TRAEFIK_DYNAMIC_DIR, dir("traefik", "dynamic"), {
      recursive: true,
    });
    try {
      const acme = await leerFicheroTraefik(env.ACME_JSON_PATH);
      await writeFile(dir("traefik", "acme.json"), acme, { mode: 0o600 });
    } catch (err) {
      log.warn(
        { err },
        "Copia sin acme.json: no se pudo leer del contenedor Traefik",
      );
    }
    const resumen = await conRestic(config, signal, async (r) => {
      const res = await crearSnapshot(r, carpeta);
      if (retencion) await aplicarRetencion(r);
      return res;
    });
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        resultado: "exito",
        snapshotId: resumen.snapshotId,
        bytesAnadidos: BigInt(resumen.bytesAnadidos),
        finalizadoEn: new Date(),
      },
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

export async function iniciarCopia(
  origen: "programado" | "manual",
): Promise<{ id: string }> {
  let config: ConfigResuelta;
  try {
    config = await cargarConfigResuelta();
  } catch (err) {
    // Without a row the scheduler would retry (and fail) every minute, silently.
    if (origen === "programado") await registrarFalloSinIniciar(err);
    throw err;
  }
  const controller = tomarOperacion();
  const backup = await prisma.backup
    .create({ data: { operacion: "copia", origen } })
    .catch((err: unknown) => {
      soltarOperacion();
      throw err;
    });

  const limite = setTimeout(() => controller.abort(MOTIVO_LIMITE), LIMITE_MS);
  void hacerCopia(backup.id, config, controller.signal)
    .catch(async (err: unknown) => {
      const error = motivoDeFallo(err, controller.signal);
      log.error({ err, backupId: backup.id }, "Copia de seguridad fallida");
      await prisma.backup.update({
        where: { id: backup.id },
        data: { resultado: "error", error, finalizadoEn: new Date() },
      });
      await notificarFalloBackup({ operacion: "copia", origen, error });
    })
    .catch((err: unknown) =>
      log.error({ err }, "No se pudo registrar el fallo de la copia"),
    )
    .finally(() => {
      clearTimeout(limite);
      soltarOperacion();
    });
  return { id: backup.id };
}

async function registrarFalloSinIniciar(err: unknown): Promise<void> {
  const error = err instanceof Error ? err.message : String(err);
  await prisma.backup.create({
    data: {
      operacion: "copia",
      origen: "programado",
      resultado: "error",
      error,
      finalizadoEn: new Date(),
    },
  });
  await notificarFalloBackup({
    operacion: "copia",
    origen: "programado",
    error,
  });
}
