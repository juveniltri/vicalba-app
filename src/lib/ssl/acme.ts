import { readFile } from "node:fs/promises";
import { z } from "zod";
import { env } from "@/env";

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
    const content = await readFile(env.ACME_JSON_PATH, "utf-8");
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
