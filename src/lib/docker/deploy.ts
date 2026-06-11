import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "@/env";
import { docker } from "./client";
import { asegurarRedCliente } from "./networks";

const execFileAsync = promisify(execFile);

async function ensureRepo(
  repoUrl: string,
  repoDir: string,
  gitEnv: NodeJS.ProcessEnv,
): Promise<void> {
  const opts = { env: gitEnv };
  try {
    await execFileAsync(
      "git",
      ["-C", repoDir, "rev-parse", "--is-inside-work-tree"],
      opts,
    );
  } catch {
    await execFileAsync("git", ["clone", repoUrl, repoDir], opts);
  }
}

async function conectarContenedoresARedCliente(
  projectSlug: string,
  clienteSlug: string,
): Promise<void> {
  try {
    const redNombre = `cliente-${clienteSlug}-network`;
    const containers = await docker.listContainers({
      all: false,
      filters: { label: [`com.docker.compose.project=${projectSlug}`] },
    });
    await Promise.all(
      containers.map(async (c) => {
        try {
          await docker.getNetwork(redNombre).connect({ Container: c.Id });
        } catch (err) {
          const msg = (err as { message?: string }).message ?? "";
          // NOTE: "already exists" means the container is already on the network — safe to ignore
          if (!msg.includes("already exists")) throw err;
        }
      }),
    );
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    console.warn(
      `[docker] Skipping conectarContenedoresARedCliente in dev: ${(err as Error).message}`,
    );
  }
}

async function resolverComando(
  repoDir: string,
  campo: "build" | "start",
  override?: string | null,
): Promise<string> {
  if (override?.trim()) return override.trim();
  try {
    const raw = await readFile(`${repoDir}/package.json`, "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (pkg.scripts?.[campo]) return `npm run ${campo}`;
    // Vite / SvelteKit usan "preview" en lugar de "start"
    if (campo === "start" && pkg.scripts?.preview) return "npm run preview";
  } catch {
    // no package.json o error de parseo
  }
  return campo === "build" ? "npm run build" : "npm start";
}

function generarDockerfileNodejs(
  buildCmd: string,
  startCmd: string,
  puerto: number,
): string {
  return [
    "FROM node:20-alpine",
    "WORKDIR /app",
    "COPY . .",
    "RUN npm ci",
    `RUN ${buildCmd}`,
    `EXPOSE ${puerto}`,
    `CMD ["sh", "-c", "${startCmd}"]`,
  ].join("\n");
}

function generarDockerComposeConBuild(params: {
  context: string;
  dockerfile: string;
  puerto: number;
}): string {
  return [
    "services:",
    "  app:",
    "    build:",
    `      context: "${params.context}"`,
    `      dockerfile: "${params.dockerfile}"`,
    "    ports:",
    `      - "${params.puerto}:${params.puerto}"`,
  ].join("\n");
}

function generarDockerComposeConImage(params: {
  imagenUrl: string;
  puerto: number;
}): string {
  return [
    "services:",
    "  app:",
    `    image: "${params.imagenUrl}"`,
    "    ports:",
    `      - "${params.puerto}:${params.puerto}"`,
  ].join("\n");
}

export async function deployProyecto(params: {
  tipo: string;
  repoUrl?: string | null;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  variables?: Array<{ clave: string; valor: string }>;
  credencial?: { clavePrivada: string };
  imagenUrl?: string | null;
  dockerfilePath?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
  puerto?: number | null;
}): Promise<{ output: string; sha: string }> {
  const {
    tipo,
    repoUrl,
    rama,
    sha,
    clienteSlug,
    proyectoNombre,
    variables,
    credencial,
    imagenUrl,
    dockerfilePath,
    buildCommand,
    startCommand,
  } = params;

  const puerto = params.puerto ?? 3000;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const panelDir = `${env.REPOS_DIR}/${clienteSlug}/.panel`;
  const envFilePath = `${panelDir}/${proyectoNombre}.env`;
  const keyFilePath = `${panelDir}/${proyectoNombre}.deploy_key`;
  const projectSlug = `${clienteSlug}-${proyectoNombre}`;

  await mkdir(panelDir, { recursive: true });

  if (credencial) {
    await writeFile(keyFilePath, credencial.clavePrivada, { mode: 0o600 });
  }

  const gitEnv: NodeJS.ProcessEnv = credencial
    ? {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${keyFilePath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null`,
      }
    : { ...process.env };

  const opts = { env: gitEnv };
  let capturedSha = "";

  try {
    // Operaciones git — solo para tipos que usan repo
    if (tipo !== "image" && repoUrl) {
      await ensureRepo(repoUrl, repoDir, gitEnv);

      if (sha) {
        await execFileAsync("git", ["-C", repoDir, "fetch", "origin"], opts);
        await execFileAsync("git", ["-C", repoDir, "checkout", sha], opts);
      } else {
        await execFileAsync("git", ["-C", repoDir, "fetch", "origin"], opts);
        await execFileAsync(
          "git",
          ["-C", repoDir, "checkout", "-B", rama, `origin/${rama}`],
          opts,
        );
      }

      capturedSha = (
        await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], opts)
      ).stdout.trim();
    }

    // Determinar fichero compose según tipo
    let composeFile: string;

    if (tipo === "compose") {
      composeFile = `${repoDir}/docker-compose.yml`;
    } else if (tipo === "dockerfile") {
      const dfPath = dockerfilePath?.trim() || "Dockerfile";
      const dfAbsoluto = dfPath.startsWith("/")
        ? dfPath
        : `${repoDir}/${dfPath}`;
      const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;
      await writeFile(
        composePath,
        generarDockerComposeConBuild({
          context: repoDir,
          dockerfile: dfAbsoluto,
          puerto,
        }),
      );
      composeFile = composePath;
    } else if (tipo === "nodejs") {
      const buildCmd = await resolverComando(repoDir, "build", buildCommand);
      const startCmd = await resolverComando(repoDir, "start", startCommand);
      const dfGenerado = `${panelDir}/${proyectoNombre}.Dockerfile`;
      const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;
      await writeFile(
        dfGenerado,
        generarDockerfileNodejs(buildCmd, startCmd, puerto),
      );
      await writeFile(
        composePath,
        generarDockerComposeConBuild({
          context: repoDir,
          dockerfile: dfGenerado,
          puerto,
        }),
      );
      composeFile = composePath;
    } else {
      // image
      const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;
      await writeFile(
        composePath,
        generarDockerComposeConImage({ imagenUrl: imagenUrl!, puerto }),
      );
      composeFile = composePath;
    }

    // Variables de entorno
    const hasVars = variables && variables.length > 0;
    if (hasVars) {
      const envContent = variables
        .map(({ clave, valor }) => {
          const escaped = valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
          return `${clave}="${escaped}"`;
        })
        .join("\n");
      await writeFile(envFilePath, envContent, "utf-8");
    }

    const composeArgs = [
      "compose",
      "-p",
      projectSlug,
      "-f",
      composeFile,
      ...(hasVars ? ["--env-file", envFilePath] : []),
      "up",
      "--build",
      "-d",
      "--force-recreate",
    ];

    let output = "";
    try {
      const { stdout, stderr } = await execFileAsync("docker", composeArgs);
      output = stdout + "\n" + stderr;
    } finally {
      if (hasVars) {
        await unlink(envFilePath).catch(() => {});
      }
    }

    if (tipo !== "image") {
      await asegurarRedCliente(clienteSlug);
      await conectarContenedoresARedCliente(projectSlug, clienteSlug);
    }

    return { output, sha: capturedSha };
  } finally {
    if (credencial) {
      await unlink(keyFilePath).catch(() => {});
    }
  }
}
