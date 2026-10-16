import { stringify } from "yaml";
import type { ConfiguracionProxy } from "@/lib/schemas/proxy";

// Internal entrypoint for /ping: reachable from the Panel over vicalba-net,
// never published on the VPS.
export const PUERTO_PING = 8082;

export function generarTraefikEstatico(
  config: ConfiguracionProxy,
  opciones: {
    acmeStorage: string;
    acmeEmail?: string;
    tokenCloudflare: boolean;
  },
): string {
  const confiables = [
    ...new Set([
      ...config.ipsConfianza,
      ...(config.cloudflare.delante ? config.cloudflare.rangos : []),
    ]),
  ];
  const confianza =
    confiables.length > 0
      ? { forwardedHeaders: { trustedIPs: confiables } }
      : {};
  const acme = (desafio: object) => ({
    acme: {
      ...(opciones.acmeEmail && { email: opciones.acmeEmail }),
      storage: opciones.acmeStorage,
      ...desafio,
    },
  });
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
      // TLS-ALPN for plain routes. Behind Cloudflare's proxy TLS-ALPN can't
      // work: DNS-01 with the API token (CF_DNS_API_TOKEN_FILE in the compose)
      // or, without a token, HTTP-01, which Cloudflare forwards.
      certificatesResolvers: {
        letsencrypt: acme({ tlsChallenge: {} }),
        "letsencrypt-http": acme({ httpChallenge: { entryPoint: "web" } }),
        ...(opciones.tokenCloudflare && {
          "letsencrypt-dns": acme({ dnsChallenge: { provider: "cloudflare" } }),
        }),
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
