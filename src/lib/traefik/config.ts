import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { stringify } from "yaml";
import { env } from "@/env";
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = logger.child({ module: "traefik" });

const CABECERA_GENERADO = "# generado por vicalba-panel";

export type RutaTraefik = {
  id: string;
  dominio: string;
  // "" = whole domain
  path: string;
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
  proyectoId: string;
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
  return `${CABECERA_GENERADO} proyecto=${params.proyectoId}\n${stringify({ http })}`;
}

export async function sincronizarTraefikCliente(
  clienteId: string,
): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    include: {
      proyectos: { include: { rutas: { orderBy: { creadoEn: "asc" } } } },
    },
  });
  if (!cliente) return;

  let ficheros: { anteriores: number; escritos: number };
  try {
    ficheros = await escribirFicherosCliente(cliente);
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    log.warn(
      { err, dir: env.TRAEFIK_DYNAMIC_DIR },
      "No se pudo escribir la config de Traefik (se omite en desarrollo)",
    );
    return;
  }

  if (ficheros.escritos > 0) await conectarTraefikARed(cliente.slug);
  else if (ficheros.anteriores > 0) await desconectarTraefikDeRed(cliente.slug);
}

async function escribirFicherosCliente(cliente: {
  slug: string;
  proyectos: { id: string; nombre: string; rutas: RutaTraefik[] }[];
}): Promise<{ anteriores: number; escritos: number }> {
  await mkdir(env.TRAEFIK_DYNAMIC_DIR, { recursive: true });
  const nombres = await readdir(env.TRAEFIK_DYNAMIC_DIR);
  // "_" isn't allowed in slugs or Proyecto names, so the prefix is unambiguous.
  const anteriores = (await leerGenerados(nombres)).filter((f) =>
    f.startsWith(`${cliente.slug}_`),
  );
  const escritos = new Set<string>();
  for (const proyecto of cliente.proyectos) {
    await borrarLegado(nombres, cliente.slug, proyecto.nombre);
    const yaml = generarConfigProyecto({
      proyectoId: proyecto.id,
      clienteSlug: cliente.slug,
      proyectoNombre: proyecto.nombre,
      rutas: proyecto.rutas,
    });
    if (!yaml) continue;
    const fichero = `${cliente.slug}_${proyecto.nombre}.yml`;
    await writeFile(ruta(fichero), yaml, "utf-8");
    escritos.add(fichero);
  }
  for (const fichero of anteriores)
    if (!escritos.has(fichero)) await borrar(fichero);
  return { anteriores: anteriores.length, escritos: escritos.size };
}

// Runs at startup: the disk always ends up matching the DB (migration from the
// old file names, restored backups, hand edits).
export async function regenerarConfigTraefik(): Promise<void> {
  const clientes = await prisma.cliente.findMany({
    select: { id: true, slug: true },
  });
  for (const cliente of clientes) {
    try {
      await sincronizarTraefikCliente(cliente.id);
    } catch (err) {
      log.error(
        { err, clienteId: cliente.id },
        "No se pudo regenerar la config de Traefik del Cliente",
      );
    }
  }
  const slugs = new Set(clientes.map((c) => c.slug));
  const nombres = await readdir(env.TRAEFIK_DYNAMIC_DIR);
  for (const fichero of await leerGenerados(nombres))
    if (!slugs.has(fichero.split("_")[0])) await borrar(fichero);
}

const ruta = (fichero: string) => `${env.TRAEFIK_DYNAMIC_DIR}/${fichero}`;

const borrar = (fichero: string) => rm(ruta(fichero), { force: true });

// Before 2.3.0 files were "<proyecto>.yml" with no header; delete one only if it
// points at this Proyecto's alias, so a hand-written file with that name survives.
async function borrarLegado(
  nombres: string[],
  clienteSlug: string,
  proyectoNombre: string,
): Promise<void> {
  const fichero = `${proyectoNombre}.yml`;
  if (!nombres.includes(fichero)) return;
  const contenido = await readFile(ruta(fichero), "utf-8");
  if (contenido.includes(`"http://${clienteSlug}-${proyectoNombre}:`))
    await borrar(fichero);
}

async function leerGenerados(nombres: string[]): Promise<string[]> {
  const generados: string[] = [];
  for (const nombre of nombres) {
    if (!nombre.endsWith(".yml")) continue;
    const contenido = await readFile(ruta(nombre), "utf-8");
    if (contenido.startsWith(`${CABECERA_GENERADO} `)) generados.push(nombre);
  }
  return generados;
}
