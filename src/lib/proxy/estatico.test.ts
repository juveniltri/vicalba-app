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
  certificatesResolvers: {
    letsencrypt: {
      acme: { email?: string; storage: string; tlsChallenge: object };
    };
  };
  log: { level: string };
  accessLog?: unknown;
  api: unknown;
};

const generar = (
  config = CONFIG_PROXY_POR_DEFECTO,
  opciones: { acmeEmail?: string } = {},
) =>
  parse(
    generarTraefikEstatico(config, {
      acmeStorage: "/letsencrypt/acme.json",
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
