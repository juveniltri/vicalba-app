import { z } from "zod";

const rango = z.union([z.cidrv4(), z.cidrv6()]);

// A bad answer must not reach trustedIPs: trusting the wrong ranges would let
// anyone spoof X-Forwarded-For, so anything unexpected throws.
export async function descargarRangosCloudflare(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string[]> {
  const listas = await Promise.all(
    ["ips-v4", "ips-v6"].map(async (lista) => {
      const res = await fetchImpl(`https://www.cloudflare.com/${lista}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok)
        throw new Error(`Cloudflare respondió ${res.status} a ${lista}`);
      return (await res.text()).split(/\r?\n/).filter((l) => l.trim());
    }),
  );
  const rangos = listas.flat().map((l) => l.trim());
  if (rangos.length === 0)
    throw new Error("Cloudflare devolvió una lista vacía");
  const invalido = rangos.find((r) => !rango.safeParse(r).success);
  if (invalido)
    throw new Error(`Rango no válido en la lista de Cloudflare: ${invalido}`);
  return rangos;
}
