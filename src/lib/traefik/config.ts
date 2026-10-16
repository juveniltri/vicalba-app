import { mkdir, unlink, writeFile } from "node:fs/promises";
import { stringify } from "yaml";
import { env } from "@/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "traefik" });

export const CABECERA_GENERADO = "# generado por vicalba-panel";

export type RutaTraefik = {
  id: string;
  dominio: string;
  path: string | null;
  servicio: string | null;
  puerto: number;
  redireccionWww: "ninguna" | "a_raiz" | "a_www";
};

// The route's dominio is always the destination: "a_raiz" redirects www.<dominio>
// to it and "a_www" expects a www.<raíz> dominio and redirects the root to it.
export function hostRedireccionWww(
  ruta: Pick<RutaTraefik, "dominio" | "redireccionWww">,
): string | null {
  if (ruta.redireccionWww === "a_raiz") return `www.${ruta.dominio}`;
  if (ruta.redireccionWww === "a_www")
    return ruta.dominio.replace(/^www\./, "");
  return null;
}

// Validated at the router too; a stray backtick would let a value rewrite the rule.
const limpiar = (valor: string) => valor.replace(/[`\n\r]/g, "");

export function generarConfigProyecto(params: {
  clienteSlug: string;
  proyectoNombre: string;
  rutas: RutaTraefik[];
}): string | null {
  if (params.rutas.length === 0) return null;
  const base = `${params.clienteSlug}-${params.proyectoNombre}`;
  const routers: Record<string, unknown> = {};
  const services: Record<string, unknown> = {};
  const middlewares: Record<string, unknown> = {};

  for (const ruta of params.rutas) {
    // The base never contains a dot, so "<servicio>.<base>" can't collide
    // with another Proyecto's alias on the same Cliente network.
    const alias = ruta.servicio ? `${ruta.servicio}.${base}` : base;
    const nombre = `${base}-${ruta.id}`;
    const host = `Host(\`${limpiar(ruta.dominio)}\`)`;
    routers[nombre] = {
      rule: ruta.path
        ? `${host} && PathPrefix(\`${limpiar(ruta.path)}\`)`
        : host,
      service: nombre,
      entryPoints: ["websecure"],
      tls: { certResolver: "letsencrypt" },
    };
    services[nombre] = {
      loadBalancer: { servers: [{ url: `http://${alias}:${ruta.puerto}` }] },
    };

    // Own router (and certificate) for the secondary host: if its DNS isn't
    // ready, Let's Encrypt fails only this one, not the route's domain.
    const origen = hostRedireccionWww(ruta);
    if (origen) {
      const redireccion = `${nombre}-www`;
      routers[redireccion] = {
        rule: `Host(\`${limpiar(origen)}\`)`,
        service: nombre,
        entryPoints: ["websecure"],
        middlewares: [redireccion],
        tls: { certResolver: "letsencrypt" },
      };
      middlewares[redireccion] = {
        redirectRegex: {
          regex: `^https?://${origen.replace(/\./g, "\\.")}/(.*)`,
          replacement: `https://${ruta.dominio}/\${1}`,
          permanent: true,
        },
      };
    }
  }

  const http =
    Object.keys(middlewares).length > 0
      ? { routers, services, middlewares }
      : { routers, services };
  return `${CABECERA_GENERADO}\n${stringify({ http })}`;
}

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
    log.warn(
      {
        code: (err as NodeJS.ErrnoException).code,
        dir: env.TRAEFIK_DYNAMIC_DIR,
      },
      "No se pudo escribir la config de Traefik (se omite en desarrollo)",
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
