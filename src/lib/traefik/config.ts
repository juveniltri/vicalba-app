import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { stringify } from "yaml";
import { env } from "@/env";
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { asegurarRedCliente } from "@/lib/docker/networks";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { type Middlewares, middlewaresSchema } from "@/lib/schemas/middlewares";
import {
  CONFIG_PROXY_POR_DEFECTO,
  configuracionProxySchema,
} from "@/lib/schemas/proxy";

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
  // Proxied by Cloudflare (orange cloud)
  cloudflare: boolean;
  // Only Cloudflare's edges may connect (needs `cloudflare`)
  soloCloudflare: boolean;
  middlewares: Middlewares;
};

// From the applied Proxy config: which resolver Cloudflare routes use (DNS-01
// needs the API token) and which ranges hide the visitor's real IP.
export type ContextoCloudflare = {
  resolver: "letsencrypt-dns" | "letsencrypt-http";
  rangos: string[];
};

// Cheap rejections first (IP, rate) so bcrypt only runs for traffic that can pass.
function cadenaMiddlewares(
  ruta: RutaTraefik,
  cloudflare: ContextoCloudflare,
): [string, unknown][] {
  const m = ruta.middlewares;
  const c = m.cabeceras;
  // Behind Cloudflare the connection comes from its edge: the visitor is the
  // last X-Forwarded-For address outside Cloudflare's ranges.
  const estrategia = ruta.cloudflare
    ? { ipStrategy: { excludedIPs: cloudflare.rangos } }
    : {};
  const cadena: [string, unknown][] = [];
  if (m.ipPermitidas)
    cadena.push([
      "ip",
      { ipAllowList: { sourceRange: m.ipPermitidas, ...estrategia } },
    ]);
  if (m.limitePeticiones)
    cadena.push([
      "limite",
      {
        rateLimit: {
          average: m.limitePeticiones.media,
          burst: m.limitePeticiones.rafaga,
          period: "1s",
          ...(ruta.cloudflare && { sourceCriterion: estrategia }),
        },
      },
    ]);
  if (m.basicAuth)
    cadena.push([
      "auth",
      {
        basicAuth: {
          users: m.basicAuth.usuarios.map((u) => `${u.usuario}:${u.hash}`),
          removeHeader: true,
        },
      },
    ]);
  if (m.bodyMaximoMB)
    cadena.push([
      "body",
      { buffering: { maxRequestBodyBytes: m.bodyMaximoMB * 1024 * 1024 } },
    ]);
  if (m.quitarPrefijo && ruta.path)
    cadena.push([
      "prefijo",
      { stripPrefix: { prefixes: [limpiar(ruta.path)] } },
    ]);
  if (c)
    cadena.push([
      "cabeceras",
      {
        headers: {
          ...(c.hsts && { stsSeconds: 31536000, stsIncludeSubdomains: true }),
          ...(c.nosniff && { contentTypeNosniff: true }),
          ...(c.frameDeny && { frameDeny: true }),
          ...(c.referrerPolicy && { referrerPolicy: c.referrerPolicy }),
          ...(c.propias && { customResponseHeaders: c.propias }),
        },
      },
    ]);
  if (m.compresion) cadena.push(["compresion", { compress: {} }]);
  if (ruta.cloudflare && ruta.soloCloudflare) {
    // No ipStrategy: the check runs on the TCP peer (RemoteAddr), which a
    // client can't forge through X-Forwarded-For. Empty ranges must block
    // everyone, never let everyone in.
    if (cloudflare.rangos.length === 0)
      log.warn(
        { ruta: ruta.id },
        "Solo desde Cloudflare sin rangos aplicados: la ruta rechaza todo el tráfico",
      );
    cadena.unshift([
      "cloudflare",
      {
        ipAllowList: {
          sourceRange:
            cloudflare.rangos.length > 0
              ? cloudflare.rangos
              : ["255.255.255.255/32"],
        },
      },
    ]);
  }
  return cadena;
}

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
  cloudflare: ContextoCloudflare;
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
    const cadena = cadenaMiddlewares(ruta, params.cloudflare);
    const tls = {
      certResolver: ruta.cloudflare
        ? params.cloudflare.resolver
        : "letsencrypt",
    };
    for (const [tipo, definicion] of cadena)
      middlewares[`${nombre}-${tipo}`] = definicion;
    routers[nombre] = {
      rule: ruta.path
        ? `${host} && PathPrefix(\`${limpiar(ruta.path)}\`)`
        : host,
      service: nombre,
      entryPoints: ["websecure"],
      ...(cadena.length > 0 && {
        middlewares: cadena.map(([tipo]) => `${nombre}-${tipo}`),
      }),
      tls,
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
        tls,
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

export async function contextoCloudflare(): Promise<ContextoCloudflare> {
  const fila = await prisma.configuracionProxy.findUnique({
    where: { id: "default" },
  });
  const aplicada = fila
    ? configuracionProxySchema.parse(fila.aplicada)
    : CONFIG_PROXY_POR_DEFECTO;
  return {
    resolver: fila?.cfTokenCifrado ? "letsencrypt-dns" : "letsencrypt-http",
    rangos: aplicada.cloudflare.rangos,
  };
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
  // A corrupt middlewares column throws: silently dropping it would publish
  // the route without its auth or IP allowlist.
  const proyectos = cliente.proyectos.map((p) => ({
    ...p,
    rutas: p.rutas.map((r) => ({
      ...r,
      middlewares: middlewaresSchema.parse(r.middlewares),
    })),
  }));

  const cloudflare = await contextoCloudflare();

  let ficheros: { anteriores: number; escritos: number };
  try {
    ficheros = await escribirFicherosCliente(
      { slug: cliente.slug, proyectos },
      cloudflare,
    );
  } catch (err) {
    if (env.NODE_ENV === "production") throw err;
    log.warn(
      { err, dir: env.TRAEFIK_DYNAMIC_DIR },
      "No se pudo escribir la config de Traefik (se omite en desarrollo)",
    );
    return;
  }

  if (ficheros.escritos > 0) {
    await asegurarRedCliente(cliente.slug);
    await conectarTraefikARed(cliente.slug);
  } else if (ficheros.anteriores > 0)
    await desconectarTraefikDeRed(cliente.slug);
}

async function escribirFicherosCliente(
  cliente: {
    slug: string;
    proyectos: { id: string; nombre: string; rutas: RutaTraefik[] }[];
  },
  cloudflare: ContextoCloudflare,
): Promise<{ anteriores: number; escritos: number }> {
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
      cloudflare,
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
