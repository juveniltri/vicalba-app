import { mkdir, unlink, writeFile } from "node:fs/promises";
import { env } from "@/env";

export function generarConfigTraefik(params: {
  dominio: string;
  proyectoSlug: string;
  clienteSlug: string;
  puerto?: number;
}): string {
  const { proyectoSlug, clienteSlug, puerto = 80 } = params;
  const dominio = params.dominio.replace(/[`\n\r]/g, "");
  const nombre = `${clienteSlug}-${proyectoSlug}`;

  return [
    "http:",
    "  routers:",
    `    ${nombre}:`,
    `      rule: "Host(\`${dominio}\`)"`,
    `      service: ${nombre}`,
    "      tls:",
    "        certResolver: letsencrypt",
    "  services:",
    `    ${nombre}:`,
    "      loadBalancer:",
    "        servers:",
    `          - url: "http://${nombre}:${puerto}"`,
  ].join("\n");
}

export async function escribirConfigTraefik(
  proyectoSlug: string,
  yaml: string,
): Promise<void> {
  try {
    await mkdir(env.TRAEFIK_DYNAMIC_DIR, { recursive: true });
    await writeFile(
      `${env.TRAEFIK_DYNAMIC_DIR}/${proyectoSlug}.yml`,
      yaml,
      "utf-8",
    );
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    console.warn(
      `[traefik] Skipping config write in dev (${(err as NodeJS.ErrnoException).code}): ${env.TRAEFIK_DYNAMIC_DIR}`,
    );
  }
}

export async function eliminarConfigTraefik(
  proyectoSlug: string,
): Promise<void> {
  try {
    await unlink(`${env.TRAEFIK_DYNAMIC_DIR}/${proyectoSlug}.yml`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
