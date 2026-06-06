import { readFile } from "node:fs/promises";
import { env } from "@/env";

interface AcmeJson {
  [resolver: string]: {
    Certificates?: Array<{
      domain: { main: string; sans?: string[] };
    }>;
  };
}

export async function leerEstadoSSL(
  dominio: string,
): Promise<{ activo: boolean; expira: Date | null }> {
  try {
    const content = await readFile(env.ACME_JSON_PATH, "utf-8");
    const data = JSON.parse(content) as AcmeJson;
    const certs = Object.values(data).flatMap((r) => r.Certificates ?? []);
    const activo = certs.some((c) => c.domain.main === dominio);
    return { activo, expira: null };
  } catch {
    return { activo: false, expira: null };
  }
}
