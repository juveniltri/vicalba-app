import { describe, expect, it, vi } from "vitest";
import { descargarRangosCloudflare } from "./cloudflare";

const respuesta = (cuerpo: string, ok = true) =>
  ({ ok, status: ok ? 200 : 503, text: async () => cuerpo }) as Response;

describe("descargarRangosCloudflare", () => {
  it("junta las listas IPv4 e IPv6 publicadas por Cloudflare", async () => {
    const fetchFalso = vi.fn(async (url: string) =>
      respuesta(
        url.endsWith("ips-v4")
          ? "173.245.48.0/20\n103.21.244.0/22\n"
          : "2400:cb00::/32\r\n\n",
      ),
    );

    expect(await descargarRangosCloudflare(fetchFalso)).toEqual([
      "173.245.48.0/20",
      "103.21.244.0/22",
      "2400:cb00::/32",
    ]);
    expect(fetchFalso).toHaveBeenCalledWith(
      "https://www.cloudflare.com/ips-v4",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("falla si Cloudflare no responde bien", async () => {
    await expect(
      descargarRangosCloudflare(async () => respuesta("", false)),
    ).rejects.toThrow(/503/);
  });

  it("falla con contenido que no son rangos (una página de error, por ejemplo)", async () => {
    await expect(
      descargarRangosCloudflare(async () => respuesta("<html>Error</html>")),
    ).rejects.toThrow(/no válido/);
  });

  it("falla si la lista llega vacía", async () => {
    await expect(
      descargarRangosCloudflare(async () => respuesta("\n")),
    ).rejects.toThrow(/vacía/);
  });
});
