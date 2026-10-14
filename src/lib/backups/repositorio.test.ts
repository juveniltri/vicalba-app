import { describe, expect, it } from "vitest";
import {
  entornoRestic,
  urlRepositorio,
  type ConfigResuelta,
} from "./repositorio";

const rutas = {
  cacheDir: "/var/vicalba/repos/.backups/cache",
  knownHosts: "/var/vicalba/repos/.backups/known_hosts",
  ficheroClaveSsh: "/tmp/vicalba-backup-ssh/clave",
};

const s3: ConfigResuelta = {
  clave: "clave-restic",
  destino: {
    tipo: "s3",
    endpoint: "https://s3.eu-central-003.backblazeb2.com",
    bucket: "mi-bucket",
    region: "eu-central-003",
    prefijo: "vicalba",
    accessKeyId: "AKID",
    secretKey: "SECRETO",
  },
};

const sftp: ConfigResuelta = {
  clave: "clave-restic",
  destino: {
    tipo: "sftp",
    host: "backup.ejemplo.com",
    puerto: 2222,
    usuario: "copias",
    ruta: "/srv/vicalba",
    clavePrivada: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
  },
};

describe("urlRepositorio", () => {
  it("S3: endpoint, bucket y prefijo", () => {
    expect(urlRepositorio(s3.destino)).toBe(
      "s3:https://s3.eu-central-003.backblazeb2.com/mi-bucket/vicalba",
    );
  });

  it("S3 sin prefijo y con / final en el endpoint", () => {
    expect(
      urlRepositorio({
        ...s3.destino,
        endpoint: "https://r2.ejemplo.com/",
        prefijo: null,
      } as never),
    ).toBe("s3:https://r2.ejemplo.com/mi-bucket");
  });

  it("SFTP: usuario, host y ruta absoluta", () => {
    expect(urlRepositorio(sftp.destino)).toBe(
      "sftp:copias@backup.ejemplo.com:/srv/vicalba",
    );
  });
});

describe("entornoRestic", () => {
  it("S3: clave y credenciales solo en variables de entorno", () => {
    const { env, args } = entornoRestic(s3, rutas);
    expect(env).toEqual({
      RESTIC_REPOSITORY:
        "s3:https://s3.eu-central-003.backblazeb2.com/mi-bucket/vicalba",
      RESTIC_PASSWORD: "clave-restic",
      RESTIC_CACHE_DIR: rutas.cacheDir,
      AWS_ACCESS_KEY_ID: "AKID",
      AWS_SECRET_ACCESS_KEY: "SECRETO",
      AWS_DEFAULT_REGION: "eu-central-003",
    });
    expect(args).toEqual([]);
    expect(args.join(" ")).not.toContain("SECRETO");
  });

  it("S3 sin región no define AWS_DEFAULT_REGION", () => {
    const { env } = entornoRestic(
      { ...s3, destino: { ...s3.destino, region: null } as never },
      rutas,
    );
    expect(env).not.toHaveProperty("AWS_DEFAULT_REGION");
  });

  it("SFTP: sftp.command con la clave, el puerto y known_hosts persistente", () => {
    const { env, args } = entornoRestic(sftp, rutas);
    expect(env.RESTIC_REPOSITORY).toBe(
      "sftp:copias@backup.ejemplo.com:/srv/vicalba",
    );
    expect(env.RESTIC_PASSWORD).toBe("clave-restic");
    expect(args).toEqual([
      "-o",
      `sftp.command=ssh -i ${rutas.ficheroClaveSsh} -p 2222 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${rutas.knownHosts} copias@backup.ejemplo.com -s sftp`,
    ]);
    expect(JSON.stringify({ env, args })).not.toContain("BEGIN OPENSSH");
  });
});
