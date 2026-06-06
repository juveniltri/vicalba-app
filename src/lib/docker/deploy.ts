import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
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
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<string> {
  const { repoUrl, rama, clienteSlug, proyectoNombre, servicios, variables } =
    params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const overridePath = `${repoDir}/docker-compose.network.yml`;
  const envFilePath = `${repoDir}/.env.panel`;

  await ensureRepo(repoUrl, repoDir);
  await execFileAsync("git", ["-C", repoDir, "checkout", rama]);
  await execFileAsync("git", ["-C", repoDir, "pull"]);

  const overrideYaml = generarComposeOverride(clienteSlug, servicios);
  await writeFile(overridePath, overrideYaml, "utf-8");

  const hasVars = variables && variables.length > 0;

  if (hasVars) {
    const envContent = variables
      .map(({ clave, valor }) => `${clave}=${valor}`)
      .join("\n");
    await writeFile(envFilePath, envContent, "utf-8");
  }

  const composeArgs = [
    "compose",
    "-f",
    `${repoDir}/docker-compose.yml`,
    "-f",
    overridePath,
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
  return output;
}
