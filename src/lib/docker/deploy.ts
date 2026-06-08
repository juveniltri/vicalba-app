import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "@/env";
import { docker } from "./client";

const execFileAsync = promisify(execFile);

async function ensureRepo(repoUrl: string, repoDir: string): Promise<void> {
  try {
    await execFileAsync("git", [
      "-C",
      repoDir,
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    await execFileAsync("git", ["-C", repoDir, "pull"]);
  } catch {
    await execFileAsync("git", ["clone", repoUrl, repoDir]);
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
}): Promise<{ output: string; sha: string }> {
  const { repoUrl, rama, sha, clienteSlug, proyectoNombre, variables } = params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const envFilePath = `${repoDir}/.env.panel`;
  const projectSlug = `${clienteSlug}-${proyectoNombre}`;

  await ensureRepo(repoUrl, repoDir);

  if (sha) {
    await execFileAsync("git", ["-C", repoDir, "fetch", "origin"]);
    await execFileAsync("git", ["-C", repoDir, "checkout", sha]);
  } else {
    await execFileAsync("git", ["-C", repoDir, "checkout", rama]);
    await execFileAsync("git", ["-C", repoDir, "pull"]);
  }

  const revParseResult = await execFileAsync("git", [
    "-C",
    repoDir,
    "rev-parse",
    "HEAD",
  ]);
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
}
