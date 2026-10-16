import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import {
  lanzarAplicacionProxy,
  leerConfiguracionProxy,
} from "@/lib/proxy/operacion";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { hacerCopia } from "./copia";
import {
  LIMITE_MS,
  MOTIVO_LIMITE,
  motivoDeFallo,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";
import { pgRestore } from "./postgres";
import { ejecutar } from "./procesos";
import { restaurarSnapshot } from "./restic";

const log = logger.child({ module: "backups" });

// restic restores files under the absolute path they were backed up from, which
// is a temp dir of the run that made the copy: search instead of assuming it.
export async function buscarFichero(
  dir: string,
  nombre: string,
): Promise<string | null> {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isFile() && entrada.name === nombre) return ruta;
    if (entrada.isDirectory()) {
      const encontrado = await buscarFichero(ruta, nombre);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

export async function reemplazarConfigTraefik(
  origen: string,
  destino: string,
): Promise<void> {
  for (const f of await readdir(destino))
    await rm(path.join(destino, f), { recursive: true, force: true });
  await cp(origen, destino, { recursive: true });
}

async function restaurarBd(dump: string, signal: AbortSignal): Promise<void> {
  // The backup settings and history must not travel back in time: an old
  // destination or key would cut the panel off from the newer copies.
  const config = await prisma.configuracionBackup.findUnique({
    where: { id: "default" },
  });
  const credencial = config?.sftpCredencialId
    ? await prisma.credencial.findUnique({
        where: { id: config.sftpCredencialId },
      })
    : null;
  const historial = await prisma.backup.findMany();

  await pgRestore(env.DATABASE_URL, dump, signal);
  // Bring an older copy up to the current schema before writing back rows
  // that have the current shape.
  await ejecutar("npx", ["prisma", "migrate", "deploy"], {
    env: { DATABASE_URL: env.DATABASE_URL },
    signal,
  });

  const ops = [];
  if (credencial) {
    const { id, ...resto } = credencial;
    ops.push(
      prisma.credencial.upsert({
        where: { id },
        create: credencial,
        update: resto,
      }),
    );
  }
  if (config) {
    const { id, ...resto } = config;
    ops.push(
      prisma.configuracionBackup.upsert({
        where: { id },
        create: config,
        update: resto,
      }),
    );
  }
  ops.push(
    prisma.backup.deleteMany(),
    prisma.backup.createMany({ data: historial }),
  );
  await prisma.$transaction(ops);
}

export async function iniciarRestauracion(
  snapshotId: string,
): Promise<{ id: string }> {
  const config = await cargarConfigResuelta();
  const controller = tomarOperacion();
  const { signal } = controller;
  const limite = setTimeout(() => controller.abort(MOTIVO_LIMITE), LIMITE_MS);
  let restauracionId = "";

  const fallo = async (error: string) => {
    log.error({ error, snapshotId }, "Restauración fallida");
    await prisma.backup.update({
      where: { id: restauracionId },
      data: { resultado: "error", error, finalizadoEn: new Date() },
    });
    await notificarFalloBackup({
      operacion: "restauracion",
      origen: "manual",
      error,
    });
  };

  try {
    const previa = await prisma.backup.create({
      data: { operacion: "copia", origen: "antes_de_restaurar" },
    });
    const restauracion = await prisma.backup.create({
      data: { operacion: "restauracion", origen: "manual", snapshotId },
    });
    restauracionId = restauracion.id;

    void (async () => {
      let carpeta: string | null = null;
      try {
        carpeta = await mkdtemp(path.join(tmpdir(), "vicalba-restaurar-"));
        const destino = carpeta;
        try {
          await hacerCopia(previa.id, config, signal, { retencion: false });
        } catch (err) {
          const motivo = motivoDeFallo(err, signal);
          await prisma.backup.update({
            where: { id: previa.id },
            data: {
              resultado: "error",
              error: motivo,
              finalizadoEn: new Date(),
            },
          });
          throw new Error(`No se restauró: falló la copia previa (${motivo})`);
        }
        await conRestic(config, signal, (r) =>
          restaurarSnapshot(r, snapshotId, destino),
        );
        const dump = await buscarFichero(destino, "panel-db.dump");
        if (!dump) throw new Error("La copia no contiene panel-db.dump");

        await restaurarBd(dump, signal);

        const dinamica = path.join(path.dirname(dump), "traefik", "dynamic");
        await reemplazarConfigTraefik(dinamica, env.TRAEFIK_DYNAMIC_DIR).catch(
          (err: unknown) =>
            log.warn({ err }, "Restauración sin config de Traefik"),
        );
        // Prepared statements cached by the pool point at the dropped tables.
        await prisma.$disconnect();
        // The DB is the source of truth for Traefik's static config: re-apply
        // the restored one through the safe path (no restart if unchanged).
        await leerConfiguracionProxy()
          .then(({ aplicada }) => lanzarAplicacionProxy(aplicada))
          .catch((err: unknown) =>
            log.warn({ err }, "No se volvió a aplicar la config del Proxy"),
          );
        await prisma.backup.update({
          where: { id: restauracionId },
          data: { resultado: "exito", finalizadoEn: new Date() },
        });
      } catch (err) {
        await fallo(motivoDeFallo(err, signal));
      } finally {
        if (carpeta) await rm(carpeta, { recursive: true, force: true });
        clearTimeout(limite);
        soltarOperacion();
      }
    })().catch((err: unknown) =>
      log.error({ err }, "No se pudo registrar el fallo de la restauración"),
    );

    return { id: restauracionId };
  } catch (err) {
    clearTimeout(limite);
    soltarOperacion();
    throw err;
  }
}
