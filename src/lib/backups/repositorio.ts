export type DestinoResuelto =
  | {
      tipo: "s3";
      endpoint: string;
      bucket: string;
      region: string | null;
      prefijo: string | null;
      accessKeyId: string;
      secretKey: string;
    }
  | {
      tipo: "sftp";
      host: string;
      puerto: number;
      usuario: string;
      ruta: string;
      clavePrivada: string;
    }
  | { tipo: "local"; ruta: string };

export type ConfigResuelta = { destino: DestinoResuelto; clave: string };

export function urlRepositorio(destino: DestinoResuelto): string {
  if (destino.tipo === "s3") {
    const partes = [destino.endpoint.replace(/\/+$/, ""), destino.bucket];
    if (destino.prefijo) partes.push(destino.prefijo);
    return `s3:${partes.join("/")}`;
  }
  if (destino.tipo === "local") return `${destino.ruta}/restic`;
  return `sftp:${destino.usuario}@${destino.host}:${destino.ruta}`;
}

// Secrets travel only in the environment: process arguments are visible to
// anyone who can list processes in the container.
export function entornoRestic(
  config: ConfigResuelta,
  rutas: { cacheDir: string; knownHosts: string; ficheroClaveSsh: string },
): { env: Record<string, string>; args: string[] } {
  const { destino } = config;
  const env: Record<string, string> = {
    RESTIC_REPOSITORY: urlRepositorio(destino),
    RESTIC_PASSWORD: config.clave,
    RESTIC_CACHE_DIR: rutas.cacheDir,
  };
  if (destino.tipo === "s3") {
    env.AWS_ACCESS_KEY_ID = destino.accessKeyId;
    env.AWS_SECRET_ACCESS_KEY = destino.secretKey;
    if (destino.region) env.AWS_DEFAULT_REGION = destino.region;
    return { env, args: [] };
  }
  if (destino.tipo === "local") return { env, args: [] };
  // accept-new trusts the server key on first use and enforces it afterwards.
  const ssh = [
    `ssh -i ${rutas.ficheroClaveSsh}`,
    `-p ${destino.puerto}`,
    "-o StrictHostKeyChecking=accept-new",
    `-o UserKnownHostsFile=${rutas.knownHosts}`,
    `${destino.usuario}@${destino.host}`,
    "-s sftp",
  ].join(" ");
  return { env, args: ["-o", `sftp.command=${ssh}`] };
}
