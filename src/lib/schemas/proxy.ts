import { z } from "zod";

const segundos = z.number().int().min(0).max(86_400);

// Global Traefik settings edited in Configuración → Proxy. Everything but the
// TLS minimum lives in the static file, so applying it restarts Traefik.
export const configuracionProxySchema = z
  .object({
    // Proxies in front of Traefik (Cloudflare…) whose X-Forwarded-* are trusted.
    ipsConfianza: z
      .array(z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]))
      .max(200),
    // 0 = no limit
    timeouts: z.object({
      lecturaSeg: segundos,
      escrituraSeg: segundos,
      inactividadSeg: segundos,
    }),
    logNivel: z.enum(["ERROR", "WARN", "INFO", "DEBUG"]),
    accessLog: z.boolean(),
    tlsMinima: z.enum(["VersionTLS12", "VersionTLS13"]),
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
};
