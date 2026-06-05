import { mkdir, unlink, writeFile } from "node:fs/promises";
import { env } from "@/env";

export function generarConfigTraefik(params: {
  dominio: string;
  proyectoSlug: string;
  clienteSlug: string;
}): string {
  const { dominio, proyectoSlug, clienteSlug } = params;
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
    `          - url: "http://${nombre}:80"`,
  ].join("\n");
}

export async function escribirConfigTraefik(
  proyectoSlug: string,
  yaml: string,
): Promise<void> {
  await mkdir(env.TRAEFIK_DYNAMIC_DIR, { recursive: true });
  await writeFile(
    `${env.TRAEFIK_DYNAMIC_DIR}/${proyectoSlug}.yml`,
    yaml,
    "utf-8",
  );
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
