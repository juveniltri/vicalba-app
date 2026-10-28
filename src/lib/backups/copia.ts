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
  {
    retencion = true,
    comprobar = true,
  }: { retencion?: boolean; comprobar?: boolean } = {},
): Promise<void> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "vicalba-backup-"));
  const dir = (...p: string[]) => path.posix.join(carpeta, ...p);
  try {
    if (comprobar) await conRestic(config, signal, comprobarDestino);
    await pgDump(env.DATABASE_URL, dir("panel-db.dump"), signal);
    await mkdir(dir("traefik"), { recursive: true });
    await cp(env.TRAEFIK_DYNAMIC_DIR, dir("traefik", "dynamic"), {
      recursive: true,
    });
    // Reference only: the Panel regenerates it from the DB (Configuración → Proxy).
    await cp(env.TRAEFIK_STATIC_DIR, dir("traefik", "static"), {
      recursive: true,
    }).catch((err: unknown) =>
      log.warn({ err }, "Copia sin la config estática de Traefik"),
    );
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

// The Panel copy under a lock the caller already holds, with its own time
// limit: in the daily cycle that limit must stop this copy, not the Proyectos.
export async function copiarPanel(
  backupId: string,
  config: ConfigResuelta,
  operacion: AbortSignal,
  {
    origen,
    ...opciones
  }: {
    origen: "programado" | "manual";
    retencion?: boolean;
    comprobar?: boolean;
  },
): Promise<boolean> {
  const limite = new AbortController();
  const temporizador = setTimeout(() => limite.abort(MOTIVO_LIMITE), LIMITE_MS);
  const signal = AbortSignal.any([operacion, limite.signal]);
  try {
    await hacerCopia(backupId, config, signal, opciones);
    return true;
  } catch (err) {
    const error = motivoDeFallo(err, signal);
    log.error({ err, backupId }, "Copia de seguridad fallida");
    try {
      await prisma.backup.update({
        where: { id: backupId },
        data: { resultado: "error", error, finalizadoEn: new Date() },
      });
      await notificarFalloBackup({ operacion: "copia", origen, error });
    } catch (e) {
      log.error({ err: e }, "No se pudo registrar el fallo de la copia");
    }
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

// The Panel's «Copiar ahora»; the scheduled copy runs in the daily cycle.
export async function iniciarCopia(origen: "manual"): Promise<{ id: string }> {
  const config = await cargarConfigResuelta();
  const controller = tomarOperacion();
  const backup = await prisma.backup
    .create({ data: { operacion: "copia", origen } })
    .catch((err: unknown) => {
      soltarOperacion();
      throw err;
    });

  void copiarPanel(backup.id, config, controller.signal, { origen }).finally(
    () => soltarOperacion(),
  );
  return { id: backup.id };
}

// Without a row the scheduler would retry (and fail) every minute, silently.
export async function registrarFalloSinIniciar(err: unknown): Promise<void> {
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
