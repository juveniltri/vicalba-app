import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CONFIG_PROXY_POR_DEFECTO,
  configuracionProxySchema,
} from "@/lib/schemas/proxy";
import { generarTlsDinamico, generarTraefikEstatico } from "./estatico";

type Estatico = {
  entryPoints: Record<
    string,
    {
      address: string;
      http?: unknown;
      forwardedHeaders?: { trustedIPs: string[] };
      transport?: { respondingTimeouts: Record<string, string> };
    }
  >;
  ping?: { entryPoint: string };
  providers: unknown;
  certificatesResolvers: Record<
    string,
    {
      acme: {
        email?: string;
        storage: string;
        tlsChallenge?: object;
        httpChallenge?: object;
        dnsChallenge?: object;
      };
    }
  >;
  log: { level: string };
  accessLog?: unknown;
  api: unknown;
};

const generar = (
  config = CONFIG_PROXY_POR_DEFECTO,
  opciones: { acmeEmail?: string; tokenCloudflare?: boolean } = {},
) =>
  parse(
    generarTraefikEstatico(config, {
      acmeStorage: "/letsencrypt/acme.json",
      tokenCloudflare: false,
      ...opciones,
    }),
  ) as Estatico;

describe("generarTraefikEstatico", () => {
  it("por defecto reproduce la configuración de siempre, más el ping interno", () => {
    const c = generar();

    expect(c.api).toEqual({ dashboard: false });
    expect(c.entryPoints.web).toEqual({
      address: ":80",
      http: {
        redirections: {
          entryPoint: { to: "websecure", scheme: "https", permanent: true },
        },
      },
    });
    expect(c.entryPoints.websecure).toEqual({
      address: ":443",
      transport: {
        respondingTimeouts: {
          readTimeout: "60s",
          writeTimeout: "0s",
          idleTimeout: "180s",
        },
      },
    });
    expect(c.entryPoints.ping).toEqual({ address: ":8082" });
    expect(c.ping).toEqual({ entryPoint: "ping" });
    expect(c.providers).toEqual({
      docker: { exposedByDefault: false, network: "vicalba-net" },
      file: { directory: "/etc/traefik/dynamic", watch: true },
    });
    expect(c.certificatesResolvers.letsencrypt.acme).toEqual({
      storage: "/letsencrypt/acme.json",
      tlsChallenge: {},
    });
    expect(c.log).toEqual({ level: "INFO" });
    expect(c.accessLog).toBeUndefined();
  });

  it("incluye el email de ACME, que los flags de CLI no llegaban a aplicar", () => {
    expect(
      generar(CONFIG_PROXY_POR_DEFECTO, { acmeEmail: "ops@vicalba.com" })
        .certificatesResolvers.letsencrypt.acme.email,
    ).toBe("ops@vicalba.com");
  });

  it("aplica IPs de confianza a los dos entrypoints, timeouts, nivel de log y access log en JSON", () => {
    const c = generar({
      ...CONFIG_PROXY_POR_DEFECTO,
      ipsConfianza: ["173.245.48.0/20", "2400:cb00::/32"],
      timeouts: { lecturaSeg: 30, escrituraSeg: 120, inactividadSeg: 0 },
      logNivel: "DEBUG",
      accessLog: true,
    });

    for (const ep of ["web", "websecure"])
      expect(c.entryPoints[ep].forwardedHeaders).toEqual({
        trustedIPs: ["173.245.48.0/20", "2400:cb00::/32"],
      });
    expect(c.entryPoints.websecure.transport?.respondingTimeouts).toEqual({
      readTimeout: "30s",
      writeTimeout: "120s",
      idleTimeout: "0s",
    });
    expect(c.log).toEqual({ level: "DEBUG" });
    expect(c.accessLog).toEqual({ format: "json" });
  });
});

describe("generarTraefikEstatico — Cloudflare", () => {
  it("siempre hay un resolver HTTP-01 además del TLS-ALPN; el de DNS solo con token", () => {
    const sinToken = generar().certificatesResolvers;
    expect(Object.keys(sinToken)).toEqual(["letsencrypt", "letsencrypt-http"]);
    expect(sinToken["letsencrypt-http"].acme).toEqual({
      storage: "/letsencrypt/acme.json",
      httpChallenge: { entryPoint: "web" },
    });

    const conToken = generar(CONFIG_PROXY_POR_DEFECTO, {
      tokenCloudflare: true,
      acmeEmail: "ops@vicalba.com",
    }).certificatesResolvers;
    expect(conToken["letsencrypt-dns"].acme).toEqual({
      email: "ops@vicalba.com",
      storage: "/letsencrypt/acme.json",
      dnsChallenge: { provider: "cloudflare" },
    });
  });

  it("con Cloudflare delante confía en sus rangos además de en las IPs propias, sin repetir", () => {
    const c = generar({
      ...CONFIG_PROXY_POR_DEFECTO,
      ipsConfianza: ["10.0.0.1", "173.245.48.0/20"],
      cloudflare: {
        delante: true,
        rangos: ["173.245.48.0/20", "2400:cb00::/32"],
      },
    });
    expect(c.entryPoints.websecure.forwardedHeaders?.trustedIPs).toEqual([
      "10.0.0.1",
      "173.245.48.0/20",
      "2400:cb00::/32",
    ]);
  });

  it("sin Cloudflare delante sus rangos no cuentan", () => {
    const c = generar({
      ...CONFIG_PROXY_POR_DEFECTO,
      cloudflare: { delante: false, rangos: ["173.245.48.0/20"] },
    });
    expect(c.entryPoints.websecure.forwardedHeaders).toBeUndefined();
  });

  it("los valores por defecto traen los rangos publicados por Cloudflare y lo dejan desactivado", () => {
    expect(CONFIG_PROXY_POR_DEFECTO.cloudflare.delante).toBe(false);
    expect(CONFIG_PROXY_POR_DEFECTO.cloudflare.rangos).toContain(
      "173.245.48.0/20",
    );
    expect(CONFIG_PROXY_POR_DEFECTO.cloudflare.rangos).toContain(
      "2400:cb00::/32",
    );
  });

  it("una configuración guardada antes de existir Cloudflare se lee con sus valores por defecto", () => {
    const antigua: Partial<typeof CONFIG_PROXY_POR_DEFECTO> = {
      ...CONFIG_PROXY_POR_DEFECTO,
    };
    delete antigua.cloudflare;
    expect(configuracionProxySchema.parse(antigua).cloudflare).toEqual(
      CONFIG_PROXY_POR_DEFECTO.cloudflare,
    );
  });
});

describe("generarTlsDinamico", () => {
  it("fija la versión mínima de TLS por defecto", () => {
    expect(parse(generarTlsDinamico(CONFIG_PROXY_POR_DEFECTO))).toEqual({
      tls: { options: { default: { minVersion: "VersionTLS12" } } },
    });
    expect(
      parse(
        generarTlsDinamico({
          ...CONFIG_PROXY_POR_DEFECTO,
          tlsMinima: "VersionTLS13",
        }),
      ),
    ).toEqual({
      tls: { options: { default: { minVersion: "VersionTLS13" } } },
    });
  });
});

describe("configuracionProxySchema", () => {
  it.each([
    ["IP de confianza mal formada", { ipsConfianza: ["no-ip"] }],
    [
      "timeout negativo",
      { timeouts: { lecturaSeg: -1, escrituraSeg: 0, inactividadSeg: 0 } },
    ],
    ["nivel de log desconocido", { logNivel: "TRACE" }],
    ["TLS 1.1", { tlsMinima: "VersionTLS11" }],
  ])("rechaza %s", (_caso, cambio) => {
    expect(
      configuracionProxySchema.safeParse({
        ...CONFIG_PROXY_POR_DEFECTO,
        ...cambio,
      }).success,
    ).toBe(false);
  });
});
