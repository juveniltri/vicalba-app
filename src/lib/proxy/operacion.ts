import { Prisma } from "@prisma/client";
import { env } from "@/env";
import { cifrar, descifrar } from "@/lib/crypto";
import { depsAplicarTraefik } from "@/lib/docker/traefik";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  CONFIG_PROXY_POR_DEFECTO,
  type ConfiguracionProxy,
  configuracionProxySchema,
} from "@/lib/schemas/proxy";
import { aplicarConfiguracionProxy } from "./aplicar";
import { generarTlsDinamico, generarTraefikEstatico } from "./estatico";

const log = logger.child({ module: "proxy" });

const ID = "default";

export class OperacionProxyEnCurso extends Error {
  constructor() {
    super("Ya se está aplicando una configuración del Proxy");
    this.name = "OperacionProxyEnCurso";
  }
}

const opcionesAcme = (token: string | null) => ({
  acmeStorage: env.ACME_JSON_PATH,
  acmeEmail: env.ACME_EMAIL,
  tokenCloudflare: token !== null,
});

type FilaToken = {
  cfTokenCifrado: string | null;
  cfTokenIv: string | null;
  cfTokenAuthTag: string | null;
} | null;

const tokenGuardado = (fila: FilaToken) =>
  fila?.cfTokenCifrado && fila.cfTokenIv && fila.cfTokenAuthTag
    ? descifrar(fila.cfTokenCifrado, fila.cfTokenIv, fila.cfTokenAuthTag)
    : null;

export async function leerConfiguracionProxy() {
  const fila = await prisma.configuracionProxy.findUnique({
    where: { id: ID },
  });
  return {
    // Never the token itself: it stays on the server.
    hayTokenCloudflare: !!fila?.cfTokenCifrado,
    aplicada: fila
      ? configuracionProxySchema.parse(fila.aplicada)
      : CONFIG_PROXY_POR_DEFECTO,
    pendiente: fila?.pendiente
      ? configuracionProxySchema.parse(fila.pendiente)
      : null,
    estado: fila?.estado ?? ("aplicada" as const),
    mensaje: fila?.mensaje ?? null,
    log: fila?.log ?? null,
  };
}

// Answers before Traefik restarts: the request that asked for it goes through
// Traefik too and would be cut. `terminado` is for tests and the startup path.
// tokenCloudflare: undefined keeps the stored one, null removes it.
export async function lanzarAplicacionProxy(
  config: ConfiguracionProxy,
  tokenCloudflare?: string | null,
): Promise<{ terminado: Promise<void> }> {
  await prisma.configuracionProxy.upsert({
    where: { id: ID },
    create: { id: ID, aplicada: CONFIG_PROXY_POR_DEFECTO },
    update: {},
  });
  const { count } = await prisma.configuracionProxy.updateMany({
    where: { id: ID, estado: { not: "en_curso" } },
    data: { estado: "en_curso", pendiente: config, mensaje: null, log: null },
  });
  if (count === 0) throw new OperacionProxyEnCurso();
  if (tokenCloudflare !== undefined) {
    const cifrado = tokenCloudflare === null ? null : cifrar(tokenCloudflare);
    await prisma.configuracionProxy.update({
      where: { id: ID },
      data: {
        cfTokenCifrado: cifrado?.valorCifrado ?? null,
        cfTokenIv: cifrado?.iv ?? null,
        cfTokenAuthTag: cifrado?.authTag ?? null,
      },
    });
  }
  return { terminado: ejecutar(config) };
}

async function ejecutar(config: ConfiguracionProxy): Promise<void> {
  try {
    const deps = depsAplicarTraefik();
    const token = tokenGuardado(
      await prisma.configuracionProxy.findUnique({ where: { id: ID } }),
    );
    // Before the restart, so a new DNS-01 resolver finds it.
    await deps.escribirTokenCloudflare(token);
    const r = await aplicarConfiguracionProxy(
      config,
      opcionesAcme(token),
      deps,
    );
    await prisma.configuracionProxy.update({
      where: { id: ID },
      data:
        r.resultado === "aplicada"
          ? {
              estado: "aplicada",
              aplicada: config,
              pendiente: Prisma.DbNull,
              mensaje: null,
              log: null,
            }
          : { estado: r.resultado, mensaje: r.mensaje, log: r.log },
    });
    if (r.resultado === "aplicada") {
      // Routes pick their resolver and IP strategy from this config. Imported
      // here: the Traefik route module reads the Proxy config too.
      const { regenerarConfigTraefik } = await import("@/lib/traefik/config");
      await regenerarConfigTraefik();
    }
  } catch (err) {
    log.error(
      { err },
      "Error inesperado al aplicar la configuración del Proxy",
    );
    // Background work: a rejection here would be unhandled and kill the process.
    await prisma.configuracionProxy
      .update({
        where: { id: ID },
        data: { estado: "error", mensaje: `Error inesperado: ${String(err)}` },
      })
      .catch((e: unknown) =>
        log.error({ err: e }, "No se pudo guardar el error del Proxy"),
      );
  }
}

// An operation only lives in this process: one left en_curso died with it.
export async function limpiarOperacionProxyHuerfana(): Promise<number> {
  const { count } = await prisma.configuracionProxy.updateMany({
    where: { id: ID, estado: "en_curso" },
    data: {
      estado: "error",
      mensaje:
        "Interrumpido por reinicio del Panel; comprueba que Traefik funciona y vuelve a aplicar.",
    },
  });
  return count;
}

// Fresh installs and updates from < 2.3.0 have no static file. Without it
// Traefik doesn't fail: it silently runs its defaults (only :80, no HTTPS, no
// providers), so it must be restarted once the file is written.
export async function asegurarTraefikEstatico(): Promise<boolean> {
  const deps = depsAplicarTraefik();
  if ((await deps.leerEstatico()) !== null) return false;
  const { aplicada } = await leerConfiguracionProxy();
  const token = tokenGuardado(
    await prisma.configuracionProxy.findUnique({ where: { id: ID } }),
  );
  await deps.escribirTokenCloudflare(token);
  await deps.escribirEstatico(
    generarTraefikEstatico(aplicada, opcionesAcme(token)),
  );
  await deps.escribirTls(generarTlsDinamico(aplicada));
  await deps.reiniciarTraefik();
  return true;
}
