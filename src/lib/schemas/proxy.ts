import { z } from "zod";

const segundos = z.number().int().min(0).max(86_400);

const ipORango = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

// Published at cloudflare.com/ips-v4 and /ips-v6 (16/10/2026); the Panel can
// refresh them from Configuración → Proxy.
export const RANGOS_CLOUDFLARE = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

// Global Traefik settings edited in Configuración → Proxy. Everything but the
// TLS minimum lives in the static file, so applying it restarts Traefik.
export const configuracionProxySchema = z
  .object({
    // Proxies in front of Traefik (Cloudflare…) whose X-Forwarded-* are trusted.
    ipsConfianza: z.array(ipORango).max(200),
    // 0 = no limit
    timeouts: z.object({
      lecturaSeg: segundos,
      escrituraSeg: segundos,
      inactividadSeg: segundos,
    }),
    logNivel: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]),
    accessLog: z.boolean(),
    tlsMinima: z.enum(["VersionTLS12", "VersionTLS13"]),
    // "delante": some domains are proxied by Cloudflare, so its ranges are
    // trusted for X-Forwarded-* and excluded when middlewares look for the IP.
    cloudflare: z
      .object({
        delante: z.boolean(),
        rangos: z.array(ipORango).max(100),
      })
      .default({ delante: false, rangos: RANGOS_CLOUDFLARE }),
  })
  .strict();

export type ConfiguracionProxy = z.infer<typeof configuracionProxySchema>;

// Traefik v3's own defaults, so a fresh install behaves as before 2.3.0.
export const CONFIG_PROXY_POR_DEFECTO: ConfiguracionProxy = {
  ipsConfianza: [],
  timeouts: { lecturaSeg: 60, escrituraSeg: 0, inactividadSeg: 180 },
  logNivel: "INFO",
  accessLog: false,
  tlsMinima: "VersionTLS12",
  cloudflare: { delante: false, rangos: RANGOS_CLOUDFLARE },
};
