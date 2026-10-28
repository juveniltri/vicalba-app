import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  entornoRestic,
  type ConfigResuelta,
  type DestinoResuelto,
} from "./repositorio";
import type { Restic } from "./restic";

export class BackupsNoConfigurados extends Error {
  constructor(motivo: string) {
    super(`Backups sin configurar: ${motivo}`);
    this.name = "BackupsNoConfigurados";
  }
}

const base = path.posix.join(env.REPOS_DIR, ".backups");
export const RUTAS_BACKUP = {
  base,
  cacheDir: path.posix.join(base, "cache"),
  knownHosts: path.posix.join(base, "known_hosts"),
};

export async function cargarConfigResuelta(): Promise<ConfigResuelta> {
  const c = await prisma.configuracionBackup.findUnique({
    where: { id: "default" },
    include: { sftpCredencial: true },
  });
  if (!c) throw new BackupsNoConfigurados("no hay configuración");
  if (!c.claveCifrada || !c.claveIv || !c.claveTag) {
    throw new BackupsNoConfigurados("falta la clave de cifrado");
  }
  const clave = descifrar(c.claveCifrada, c.claveIv, c.claveTag);

  let destino: DestinoResuelto;
  if (c.tipoDestino === "s3") {
    if (
      !c.s3Endpoint ||
      !c.s3Bucket ||
      !c.s3AccessKeyId ||
      !c.s3SecretKeyCifrada ||
      !c.s3SecretKeyIv ||
      !c.s3SecretKeyTag
    ) {
      throw new BackupsNoConfigurados("destino S3 incompleto");
    }
    destino = {
      tipo: "s3",
      endpoint: c.s3Endpoint,
      bucket: c.s3Bucket,
      region: c.s3Region,
      prefijo: c.s3Prefijo,
      accessKeyId: c.s3AccessKeyId,
      secretKey: descifrar(
        c.s3SecretKeyCifrada,
        c.s3SecretKeyIv,
        c.s3SecretKeyTag,
      ),
    };
  } else if (c.tipoDestino === "sftp") {
    if (!c.sftpHost || !c.sftpUsuario || !c.sftpRuta || !c.sftpCredencial) {
      throw new BackupsNoConfigurados("destino SFTP incompleto");
    }
    const cred = c.sftpCredencial;
    destino = {
      tipo: "sftp",
      host: c.sftpHost,
      puerto: c.sftpPuerto,
      usuario: c.sftpUsuario,
      ruta: c.sftpRuta,
      clavePrivada: descifrar(cred.clavePrivadaCifrada, cred.iv, cred.authTag),
    };
  } else if (c.tipoDestino === "local") {
    destino = { tipo: "local", ruta: env.BACKUPS_LOCAL_DIR };
  } else {
    throw new BackupsNoConfigurados("no hay destino");
  }
  return { destino, clave };
}

export async function conRestic<T>(
  config: ConfigResuelta,
  signal: AbortSignal | undefined,
  fn: (r: Restic) => Promise<T>,
): Promise<T> {
  await mkdir(base, { recursive: true });
  const dirSsh =
    config.destino.tipo === "sftp"
      ? await mkdtemp(path.join(tmpdir(), "vicalba-ssh-"))
      : null;
  const ficheroClaveSsh = dirSsh ? path.posix.join(dirSsh, "clave") : "";
  try {
    if (dirSsh && config.destino.tipo === "sftp") {
      // ssh rejects keys without a trailing newline or with CRLF endings.
      const clave =
        config.destino.clavePrivada.replace(/\r\n/g, "\n").trimEnd() + "\n";
      await writeFile(ficheroClaveSsh, clave, { mode: 0o600 });
    }
    const { env: entorno, args } = entornoRestic(config, {
      cacheDir: RUTAS_BACKUP.cacheDir,
      knownHosts: RUTAS_BACKUP.knownHosts,
      ficheroClaveSsh,
    });
    return await fn({ env: entorno, args, signal });
  } finally {
    if (dirSsh) await rm(dirSsh, { recursive: true, force: true });
  }
}
