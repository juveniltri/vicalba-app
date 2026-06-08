import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "@/env";
import { docker } from "./client";

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
    await execFileAsync("git", ["-C", repoDir, "pull"], opts);
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

export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  variables?: Array<{ clave: string; valor: string }>;
  credencial?: { clavePrivada: string };
}): Promise<{ output: string; sha: string }> {
  const {
    repoUrl,
    rama,
    sha,
    clienteSlug,
    proyectoNombre,
    variables,
    credencial,
  } = params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const envFilePath = `${repoDir}/.env.panel`;
  const keyFilePath = `${repoDir}/.deploy_key`;
  const projectSlug = `${clienteSlug}-${proyectoNombre}`;

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

  try {
    await ensureRepo(repoUrl, repoDir, gitEnv);

    if (sha) {
      await execFileAsync("git", ["-C", repoDir, "fetch", "origin"], opts);
      await execFileAsync("git", ["-C", repoDir, "checkout", sha], opts);
    } else {
      await execFileAsync("git", ["-C", repoDir, "checkout", rama], opts);
      await execFileAsync("git", ["-C", repoDir, "pull"], opts);
    }

    const revParseResult = await execFileAsync(
      "git",
      ["-C", repoDir, "rev-parse", "HEAD"],
      opts,
    );
    const capturedSha = revParseResult.stdout.trim();

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
      `${repoDir}/docker-compose.yml`,
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

    await conectarContenedoresARedCliente(projectSlug, clienteSlug);

    return { output, sha: capturedSha };
  } finally {
    if (credencial) {
      await unlink(keyFilePath).catch(() => {});
    }
  }
}
