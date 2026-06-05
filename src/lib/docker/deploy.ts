import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
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

function generarComposeOverride(
  clienteSlug: string,
  servicios: string[],
): string {
  const nombreRed = `cliente-${clienteSlug}-network`;
  const serviciosYaml = servicios
    .map((s) => `  ${s}:\n    networks:\n      - default\n      - cliente-net`)
    .join("\n");

  return [
    "networks:",
    "  cliente-net:",
    `    name: ${nombreRed}`,
    "    external: true",
    "services:",
    serviciosYaml,
  ].join("\n");
}

export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
}): Promise<void> {
  const { repoUrl, rama, clienteSlug, proyectoNombre, servicios } = params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const overridePath = `${repoDir}/docker-compose.network.yml`;

  await ensureRepo(repoUrl, repoDir);
  await execFileAsync("git", ["-C", repoDir, "checkout", rama]);
  await execFileAsync("git", ["-C", repoDir, "pull"]);

  const overrideYaml = generarComposeOverride(clienteSlug, servicios);
  await writeFile(overridePath, overrideYaml, "utf-8");

  await execFileAsync("docker", [
    "compose",
    "-f",
    `${repoDir}/docker-compose.yml`,
    "-f",
    overridePath,
    "up",
    "--build",
    "-d",
    "--force-recreate",
  ]);
}
