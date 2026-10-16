import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

export const PROYECTO = "vicalba-guia";
export const RED_DEMO = "vicalba-guia-demo";
export const TMP = path.join(process.cwd(), "scripts", "guia", ".tmp");
const ENV = path.join(TMP, ".env");
const CONTENEDORES_FIJOS = ["traefik", "vicalba-db", "vicalba-panel"];
const SFTP = "vicalba-guia-sftp";

export type EntornoGuia = Record<string, string>;

export function docker(
  args: string[],
  opciones: { permitirFallo?: boolean } = {},
): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      // Git Bash on Windows rewrites /paths in arguments otherwise.
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    }).trim();
  } catch (err) {
    if (opciones.permitirFallo) return "";
    throw err;
  }
}

export function compose(args: string[]): void {
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      PROYECTO,
      "--env-file",
      ENV,
      "-f",
      "docker-compose.yml",
      "-f",
      path.join("scripts", "guia", "compose.guia.yml"),
      ...args,
    ],
    { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
}

// A host process (IIS, a local nginx) holding a port is invisible to `docker ps`.
function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((resolve) => {
    const servidor = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => servidor.close(() => resolve(true)));
    servidor.listen(puerto);
  });
}

export async function comprobarRequisitos(): Promise<void> {
  docker(["info", "--format", "{{.ServerVersion}}"]);
  const existentes = docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n");
  const ocupados = CONTENEDORES_FIJOS.filter((n) => existentes.includes(n));
  if (ocupados.length > 0) {
    throw new Error(
      `Ya existen contenedores ${ocupados.join(", ")}: para el stack del Panel antes ` +
        "(o ejecuta `npm run guia -- --limpiar` si son de una ejecución anterior).",
    );
  }
  for (const puerto of [80, 443, 5434]) {
    if (!(await puertoLibre(puerto))) {
      throw new Error(`El puerto ${puerto} está ocupado en este equipo.`);
    }
  }
  // ssh-keygen has no --version and exits non-zero on usage: only check it exists.
  if (spawnSync("ssh-keygen", ["-?"], { stdio: "ignore" }).error) {
    throw new Error(
      "Falta ssh-keygen en el PATH (viene con OpenSSH / Git for Windows).",
    );
  }
}

export function generarEnv(): EntornoGuia {
  mkdirSync(TMP, { recursive: true });
  const dbPassword = randomBytes(16).toString("hex");
  const gid = docker([
    "run",
    "--rm",
    "-v",
    "/var/run/docker.sock:/s",
    "alpine",
    "stat",
    "-c",
    "%g",
    "/s",
  ]);
  const entorno: EntornoGuia = {
    DB_PASSWORD: dbPassword,
    DATABASE_URL: `postgresql://vicalba:${dbPassword}@db:5432/vicalba`,
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    NEXTAUTH_URL: "https://localhost",
    PANEL_DOMAIN: "localhost",
    ACME_EMAIL: "guia@example.com",
    GITHUB_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    DOCKER_GID: gid,
    SENTRY_DSN: "",
  };
  writeFileSync(
    ENV,
    Object.entries(entorno)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  return entorno;
}

export async function esperarPanelSano(timeoutMs = 300_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const estado = docker(
      ["inspect", "-f", "{{.State.Health.Status}}", "vicalba-panel"],
      { permitirFallo: true },
    );
    if (estado === "healthy") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    "El Panel no llegó a estar sano en 5 minutos (docker logs vicalba-panel).",
  );
}

// The Panel writes Traefik's static file at startup; on the first start the
// volume was still root-owned, so it starts again once it can write there.
export async function reiniciarPanel(): Promise<void> {
  docker(["restart", "vicalba-panel"]);
  await esperarPanelSano();
}

// Named volumes are created root-owned; the panel runs as uid 1001.
export function prepararVolumenes(): void {
  docker([
    "exec",
    "-u",
    "0",
    "vicalba-panel",
    "chown",
    "-R",
    "1001:1001",
    "/var/vicalba/repos",
    "/etc/traefik/dynamic",
    "/etc/traefik/static",
  ]);
}

export function generarClaveSsh(): { publica: string; privada: string } {
  const fichero = path.join(TMP, "sftp_ed25519");
  rmSync(fichero, { force: true });
  rmSync(`${fichero}.pub`, { force: true });
  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "vicalba-guia",
    "-f",
    fichero,
  ]);
  return {
    publica: readFileSync(`${fichero}.pub`, "utf-8").trim(),
    privada: readFileSync(fichero, "utf-8"),
  };
}

export async function arrancarSftp(clavePublica: string): Promise<void> {
  docker([
    "run",
    "-d",
    "--name",
    SFTP,
    "--network",
    RED_DEMO,
    "--label",
    "vicalba.guia=1",
    "-e",
    `PUBLIC_KEY=${clavePublica}`,
    "-e",
    "USER_NAME=copias",
    "lscr.io/linuxserver/openssh-server:latest",
  ]);
  // The image creates the user on first start; wait for it before preparing the folder.
  for (let i = 0; i < 30; i++) {
    if (docker(["exec", SFTP, "id", "copias"], { permitirFallo: true })) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  docker([
    "exec",
    SFTP,
    "sh",
    "-c",
    "mkdir -p /config/copias && chown copias /config/copias",
  ]);
}

const LOG_DEMO = [
  "i=0; while true; do i=$((i+1));",
  'echo "{\\"level\\":30,\\"time\\":$(date +%s)000,\\"msg\\":\\"GET /productos 200 en 12 ms\\"}";',
  '[ $((i % 4)) -eq 0 ] && echo "{\\"level\\":40,\\"time\\":$(date +%s)000,\\"msg\\":\\"Caché de catálogo caducada, recargando\\"}";',
  '[ $((i % 9)) -eq 0 ] && echo "{\\"level\\":50,\\"time\\":$(date +%s)000,\\"msg\\":\\"Pasarela de pago: timeout tras 5000 ms\\"}";',
  "sleep 1; done",
].join(" ");

export function arrancarContenedoresDemo(): void {
  docker([
    "run",
    "-d",
    "--name",
    "vicalba-guia-tienda",
    "--label",
    "vicalba.guia=1",
    "--label",
    "com.docker.compose.project=tienda-mari-tienda",
    "--label",
    "com.docker.compose.service=app",
    "alpine",
    "sh",
    "-c",
    LOG_DEMO,
  ]);
}

export function limpiar(): void {
  // Demo containers first: the SFTP one keeps the demo network busy.
  const demo = docker(["ps", "-aq", "--filter", "label=vicalba.guia=1"], {
    permitirFallo: true,
  });
  if (demo) docker(["rm", "-f", ...demo.split("\n")], { permitirFallo: true });
  // By project name only, so it works even without the generated .env.
  let bajado = true;
  try {
    docker(["compose", "-p", PROYECTO, "down", "-v", "--remove-orphans"]);
  } catch {
    bajado = false;
  }
  docker(["network", "rm", RED_DEMO], { permitirFallo: true });
  // Keep .tmp (the .env) while the stack may still be up, so --limpiar can retry.
  if (bajado) rmSync(TMP, { recursive: true, force: true });
}
