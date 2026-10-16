import { stringify } from "yaml";
import type { ConfiguracionProxy } from "@/lib/schemas/proxy";

// Internal entrypoint for /ping: reachable from the Panel over vicalba-net,
// never published on the VPS.
export const PUERTO_PING = 8082;

export function generarTraefikEstatico(
  config: ConfiguracionProxy,
  opciones: { acmeStorage: string; acmeEmail?: string },
): string {
  const confianza =
    config.ipsConfianza.length > 0
      ? { forwardedHeaders: { trustedIPs: config.ipsConfianza } }
      : {};
  const t = config.timeouts;
  return `# generado por vicalba-panel — se edita en Configuración → Proxy\n${stringify(
    {
      api: { dashboard: false },
      entryPoints: {
        web: {
          address: ":80",
          ...confianza,
          http: {
            redirections: {
              entryPoint: { to: "websecure", scheme: "https", permanent: true },
            },
          },
        },
        websecure: {
          address: ":443",
          ...confianza,
          transport: {
            respondingTimeouts: {
              readTimeout: `${t.lecturaSeg}s`,
              writeTimeout: `${t.escrituraSeg}s`,
              idleTimeout: `${t.inactividadSeg}s`,
            },
          },
        },
        ping: { address: `:${PUERTO_PING}` },
      },
      ping: { entryPoint: "ping" },
      providers: {
        // Panel and stack services, discovered by labels in docker-compose
        docker: { exposedByDefault: false, network: "vicalba-net" },
        // Cliente Proyectos, written by the Panel
        file: { directory: "/etc/traefik/dynamic", watch: true },
      },
      certificatesResolvers: {
        letsencrypt: {
          acme: {
            ...(opciones.acmeEmail && { email: opciones.acmeEmail }),
            storage: opciones.acmeStorage,
            tlsChallenge: {},
          },
        },
      },
      log: { level: config.logNivel },
      ...(config.accessLog && { accessLog: { format: "json" } }),
    },
  )}`;
}

// The TLS minimum is dynamic config: it applies without restarting Traefik.
export function generarTlsDinamico(config: ConfiguracionProxy): string {
  return stringify({
    tls: { options: { default: { minVersion: config.tlsMinima } } },
  });
}
