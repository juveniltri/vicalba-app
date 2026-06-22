import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "@/env";
import { docker } from "./client";
import { asegurarRedCliente } from "./networks";
import { conectarTraefikARed } from "./traefik";

const execFileAsync = promisify(execFile);

// docker compose does not substitute ${VAR} in YAML map keys (e.g. top-level
// network names). Pre-substituting here ensures network/volume declarations
// match the references inside service definitions.
function substituirVarsEnCompose(
  content: string,
  vars: Array<{ clave: string; valor: string }>,
): string {
  return vars.reduce(
    (acc, { clave, valor }) => acc.replaceAll(`\${${clave}}`, valor),
    content,
  );
}

async function ensureRepo(
  repoUrl: string,
  repoDir: string,
  gitEnv: NodeJS.ProcessEnv,
  onLog?: (line: string) => void,
): Promise<void> {
  const opts = { env: gitEnv };
  try {
    await execFileAsync(
      "git",
      ["-C", repoDir, "rev-parse", "--is-inside-work-tree"],
      opts,
    );
    onLog?.("→ Repositorio ya clonado, actualizando...");
  } catch {
    onLog?.("→ Clonando repositorio...");
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
          await docker.getNetwork(redNombre).connect({
            Container: c.Id,
            EndpointConfig: { Aliases: [projectSlug] },
          });
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
  hasBuildVars?: boolean,
): string {
  if (hasBuildVars) {
    // Multi-stage: build vars go into builder via .env.local (auto-loaded by Next.js/dotenv).
    // Runner copies the final state of /app after the build + rm, so .env.local is not in
    // the deployed image. Builder intermediate layers still have it but are not deployed.
    return [
      "FROM node:20-alpine AS builder",
      "WORKDIR /app",
      "COPY . .",
      "RUN npm ci",
      `RUN ${buildCmd} && rm -f .env.local`,
      "",
      "FROM node:20-alpine AS runner",
      "WORKDIR /app",
      "ENV NODE_ENV=production",
      "COPY --from=builder /app .",
      `EXPOSE ${puerto}`,
      `CMD ["sh", "-c", "${startCmd}"]`,
    ].join("\n");
  }

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

function serializarEnvironment(
  variables: Array<{ clave: string; valor: string }>,
): string[] {
  if (!variables.length) return [];
  return [
    "    environment:",
    ...variables.map(
      ({ clave, valor }) =>
        `      ${clave}: "${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    ),
  ];
}

function serializarVolumes(
  volumenes: Array<{ rutaHost: string; rutaContenedor: string }>,
): string[] {
  if (!volumenes.length) return [];
  return [
    "    volumes:",
    ...volumenes.map(
      ({ rutaHost, rutaContenedor }) =>
        `      - "${rutaHost}:${rutaContenedor}"`,
    ),
  ];
}

function generarDockerComposeConBuild(params: {
  context: string;
  dockerfile: string;
  puerto: number;
  variables?: Array<{ clave: string; valor: string }>;
  volumenes?: Array<{ rutaHost: string; rutaContenedor: string }>;
}): string {
  return [
    "services:",
    "  app:",
    "    build:",
    `      context: "${params.context}"`,
    `      dockerfile: "${params.dockerfile}"`,
    "    ports:",
    `      - "${params.puerto}:${params.puerto}"`,
    ...serializarEnvironment(params.variables ?? []),
    ...serializarVolumes(params.volumenes ?? []),
  ].join("\n");
}

function generarDockerComposeConImage(params: {
  imagenUrl: string;
  puerto: number;
  variables?: Array<{ clave: string; valor: string }>;
  volumenes?: Array<{ rutaHost: string; rutaContenedor: string }>;
}): string {
  return [
    "services:",
    "  app:",
    `    image: "${params.imagenUrl}"`,
    "    ports:",
    `      - "${params.puerto}:${params.puerto}"`,
    ...serializarEnvironment(params.variables ?? []),
    ...serializarVolumes(params.volumenes ?? []),
  ].join("\n");
}

function spawnDockerCompose(
  args: string[],
  onLog?: (line: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let collected = "";
    const proc = spawn("docker", args, {
      env: { ...process.env, DOCKER_BUILDKIT: "1" },
    });

    const handleChunk = (chunk: Buffer) => {
      const text = chunk.toString();
      collected += text;
      if (onLog) {
        text
          .split("\n")
          .filter(Boolean)
          .forEach((line) => onLog(line));
      }
    };

    proc.stdout.on("data", handleChunk);
    proc.stderr.on("data", handleChunk);

    proc.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(`docker compose exited with code ${code}`);
        Object.assign(err, { stdout: collected, stderr: "" });
        reject(err);
      } else {
        resolve(collected);
      }
    });

    proc.on("error", reject);
  });
}

export async function deployProyecto(params: {
  tipo: string;
  repoUrl?: string | null;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  composeContent?: string | null;
  variables?: Array<{ clave: string; valor: string }>;
  variablesBuildTime?: Array<{ clave: string; valor: string }>;
  credencial?: { clavePrivada: string };
  imagenUrl?: string | null;
  dockerfilePath?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
  puerto?: number | null;
  volumenes?: Array<{ rutaHost: string; rutaContenedor: string }>;
  onLog?: (line: string) => void;
}): Promise<{ output: string; sha: string }> {
  const {
    tipo,
    repoUrl,
    rama,
    sha,
    clienteSlug,
    proyectoNombre,
    composeContent,
    variables,
    variablesBuildTime,
    credencial,
    imagenUrl,
    dockerfilePath,
    buildCommand,
    startCommand,
    onLog,
  } = params;
  const volumenes = params.volumenes ?? [];

  const puerto = params.puerto ?? 3000;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const panelDir = `${env.REPOS_DIR}/${clienteSlug}/.panel`;
  const keyFilePath = `${panelDir}/${proyectoNombre}.deploy_key`;
  const projectSlug = `${clienteSlug}-${proyectoNombre}`;

  await mkdir(panelDir, { recursive: true });

  if (credencial) {
    // SSH requires Unix line endings and a trailing newline — normalize before writing
    const normalizedKey =
      credencial.clavePrivada.replace(/\r\n/g, "\n").trimEnd() + "\n";
    await writeFile(keyFilePath, normalizedKey, { mode: 0o600 });
  }

  const gitEnv: NodeJS.ProcessEnv = credencial
    ? {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${keyFilePath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null`,
      }
    : { ...process.env };

  // SSH keys only work with SSH URLs — convert HTTPS GitHub URLs automatically
  const effectiveRepoUrl =
    credencial && repoUrl
      ? repoUrl.replace(
          /^https:\/\/github\.com\/(.+?)(?:\.git)?$/,
          "git@github.com:$1.git",
        )
      : repoUrl;

  const opts = { env: gitEnv };
  let capturedSha = "";

  try {
    // Operaciones git — solo para tipos que usan repo
    if (tipo !== "image" && effectiveRepoUrl) {
      await ensureRepo(effectiveRepoUrl, repoDir, gitEnv, onLog);

      if (sha) {
        onLog?.(`→ Haciendo checkout de ${sha}...`);
        await execFileAsync("git", ["-C", repoDir, "fetch", "origin"], opts);
        await execFileAsync("git", ["-C", repoDir, "checkout", sha], opts);
      } else {
        onLog?.(`→ Actualizando rama ${rama}...`);
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
      onLog?.(`→ SHA: ${capturedSha}`);
    }

    // Determinar fichero compose según tipo
    let composeFile: string;

    const runtimeVars = variables ?? [];

    if (tipo === "compose") {
      if (composeContent) {
        // User-authored compose: write to panelDir so it stays separate from any repo clone.
        // Pre-substitute ${VAR} so network/volume map keys are resolved — docker compose
        // does not interpolate variables in YAML map keys, only in values.
        const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;
        const processedContent = substituirVarsEnCompose(
          composeContent,
          runtimeVars,
        );
        await writeFile(composePath, processedContent, { encoding: "utf-8" });
        composeFile = composePath;
        if (runtimeVars.length > 0) {
          const envFilePath = `${panelDir}/${proyectoNombre}.env`;
          const envContent = runtimeVars
            .map(({ clave, valor }) => `${clave}=${valor}`)
            .join("\n");
          await writeFile(envFilePath, envContent, {
            encoding: "utf-8",
            mode: 0o600,
          });
        }
      } else {
        composeFile = `${repoDir}/docker-compose.yml`;
        // For repo-based compose files, write .env next to the compose file so
        // docker compose auto-loads it for ${VAR} substitution on every up/restart.
        if (runtimeVars.length > 0) {
          const envContent = runtimeVars
            .map(({ clave, valor }) => `${clave}=${valor}`)
            .join("\n");
          await writeFile(`${repoDir}/.env`, envContent, {
            encoding: "utf-8",
            mode: 0o600,
          });
        }
      }
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
          variables: runtimeVars,
          volumenes,
        }),
      );
      composeFile = composePath;
    } else if (tipo === "nodejs") {
      const buildCmd = await resolverComando(repoDir, "build", buildCommand);
      const startCmd = await resolverComando(repoDir, "start", startCommand);
      const dfGenerado = `${panelDir}/${proyectoNombre}.Dockerfile`;
      const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;

      const hasBuildVars = variablesBuildTime && variablesBuildTime.length > 0;
      if (hasBuildVars) {
        // Write to .env.local in the repo so COPY . . picks it up during build.
        // The multi-stage Dockerfile deletes it before the runner stage copies,
        // so the deployed image stays clean.
        const buildEnvContent = variablesBuildTime
          .map(({ clave, valor }) => `${clave}=${valor}`)
          .join("\n");
        await writeFile(`${repoDir}/.env.local`, buildEnvContent, {
          encoding: "utf-8",
          mode: 0o600,
        });
      }

      await writeFile(
        dfGenerado,
        generarDockerfileNodejs(buildCmd, startCmd, puerto, hasBuildVars),
      );
      await writeFile(
        composePath,
        generarDockerComposeConBuild({
          context: repoDir,
          dockerfile: dfGenerado,
          puerto,
          variables: runtimeVars,
          volumenes,
        }),
      );
      composeFile = composePath;
    } else {
      // image
      const composePath = `${panelDir}/${proyectoNombre}.docker-compose.yml`;
      await writeFile(
        composePath,
        generarDockerComposeConImage({
          imagenUrl: imagenUrl!,
          puerto,
          variables: runtimeVars,
          volumenes,
        }),
      );
      composeFile = composePath;
    }

    const envFileArgs =
      tipo === "compose" && composeContent && runtimeVars.length > 0
        ? ["--env-file", `${panelDir}/${proyectoNombre}.env`]
        : [];

    const composeArgs = [
      "compose",
      "-p",
      projectSlug,
      "-f",
      composeFile,
      ...envFileArgs,
      "up",
      "--build",
      "-d",
      "--force-recreate",
    ];

    onLog?.("→ Construyendo e iniciando contenedores...");

    let output = "";
    try {
      output = await spawnDockerCompose(composeArgs, onLog);
    } finally {
      if (variablesBuildTime && variablesBuildTime.length > 0) {
        await unlink(`${repoDir}/.env.local`).catch(() => {});
      }
    }

    if (tipo !== "image") {
      await asegurarRedCliente(clienteSlug);
      await conectarTraefikARed(clienteSlug);
      await conectarContenedoresARedCliente(projectSlug, clienteSlug);
    }

    onLog?.("✓ Deploy completado");
    return { output, sha: capturedSha };
  } finally {
    if (credencial) {
      await unlink(keyFilePath).catch(() => {});
    }
  }
}
