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
        }),
      )
      .optional(),
  }),
);

export async function leerEstadoSSL(
  dominio: string,
): Promise<{ activo: boolean }> {
  try {
    const content = await leerFicheroTraefik(env.ACME_JSON_PATH);
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
