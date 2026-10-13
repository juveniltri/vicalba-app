import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";
import { leerFicheroTraefik } from "@/lib/docker/traefik";

const acmeSchema = z.record(
  z.string(),
  z.object({
    Certificates: z
      .array(
        z.object({
          domain: z.object({
            main: z.string(),
            sans: z.array(z.string()).nullish(),
          }),
          certificate: z.string().optional(),
        }),
      )
      .optional(),
  }),
);

function fechaCaducidad(certificadoBase64: string | undefined): string | null {
  if (!certificadoBase64) return null;
  try {
    // Traefik stores the PEM chain base64-encoded; the leaf comes first.
    const cert = new X509Certificate(Buffer.from(certificadoBase64, "base64"));
    return new Date(cert.validTo).toISOString();
  } catch {
    return null;
  }
}

// acme.json comes through `docker exec`, so every page that shows certificates
// shares one in-flight read and reuses it for a minute. Failures are not cached
// so a Traefik restart recovers on the next request.
const CACHE_MS = 60_000;
let cache: { contenido: string; expira: number } | null = null;
let enCurso: Promise<string> | null = null;

function leerAcme(): Promise<string> {
  if (cache && cache.expira > Date.now())
    return Promise.resolve(cache.contenido);
  enCurso ??= leerFicheroTraefik(env.ACME_JSON_PATH)
    .then((contenido) => {
      cache = { contenido, expira: Date.now() + CACHE_MS };
      return contenido;
    })
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

export async function leerCertificados(): Promise<
  Record<string, { caducaEn: string | null }>
> {
  try {
    const content = await leerAcme();
    const parsed = acmeSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return {};

    const resultado: Record<string, { caducaEn: string | null }> = {};
    for (const resolver of Object.values(parsed.data)) {
      for (const cert of resolver.Certificates ?? []) {
        const caducaEn = fechaCaducidad(cert.certificate);
        for (const dominio of [cert.domain.main, ...(cert.domain.sans ?? [])]) {
          resultado[dominio] = { caducaEn };
        }
      }
    }
    return resultado;
  } catch {
    return {};
  }
}

export async function leerEstadoSSL(
  dominio: string,
): Promise<{ activo: boolean }> {
  try {
    const content = await leerAcme();
    const parsed = acmeSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return { activo: false };
    const certs = Object.values(parsed.data).flatMap(
      (r) => r.Certificates ?? [],
    );
    const activo = certs.some((c) => c.domain.main === dominio);
    return { activo };
  } catch {
    return { activo: false };
  }
}
