import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "@/env";

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

export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
}): Promise<void> {
  const { repoUrl, rama, clienteSlug, proyectoNombre } = params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;

  await ensureRepo(repoUrl, repoDir);
  await execFileAsync("git", ["-C", repoDir, "checkout", rama]);
  await execFileAsync("git", ["-C", repoDir, "pull"]);
  await execFileAsync("docker", [
    "compose",
    "-f",
    `${repoDir}/docker-compose.yml`,
    "up",
    "--build",
    "-d",
    "--force-recreate",
  ]);
}
