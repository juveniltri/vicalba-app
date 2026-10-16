import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLeer, mockLanzar, EnCurso } = vi.hoisted(() => {
  class EnCurso extends Error {}
  return { mockLeer: vi.fn(), mockLanzar: vi.fn(), EnCurso };
});
vi.mock("@/lib/proxy/operacion", () => ({
  leerConfiguracionProxy: mockLeer,
  lanzarAplicacionProxy: mockLanzar,
  OperacionProxyEnCurso: EnCurso,
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }));
vi.mock("@/lib/docker/traefik", () => ({
  depsAplicarTraefik: () => ({ ultimasLineasLog: mockLog }),
}));

import { auth } from "@/lib/auth";
import { CONFIG_PROXY_POR_DEFECTO } from "@/lib/schemas/proxy";
import { createCallerFactory, createContext } from "@/server/trpc";
import { proxyRouter } from "./proxy";

const caller = async () =>
  createCallerFactory(proxyRouter)(await createContext());

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "u1", email: "admin@vicalba.local" },
    expires: "2099-01-01",
  } as never);
});

describe("proxy", () => {
  it("obtener devuelve la configuración aplicada y el estado de la última operación", async () => {
    const estado = {
      aplicada: CONFIG_PROXY_POR_DEFECTO,
      pendiente: null,
      estado: "aplicada",
      mensaje: null,
      log: null,
    };
    mockLeer.mockResolvedValue(estado);

    expect(await (await caller()).obtener()).toEqual(estado);
  });

  it("aplicar valida, lanza la operación y responde sin esperar a Traefik", async () => {
    let terminar = () => {};
    mockLanzar.mockResolvedValue({
      terminado: new Promise<void>((r) => (terminar = r)),
    });
    const nueva = {
      ...CONFIG_PROXY_POR_DEFECTO,
      ipsConfianza: ["173.245.48.0/20"],
    };

    expect(await (await caller()).aplicar(nueva)).toEqual({
      estado: "en_curso",
    });
    expect(mockLanzar).toHaveBeenCalledWith(nueva);
    terminar();
  });

  it("aplicar con otra en curso da CONFLICT", async () => {
    mockLanzar.mockRejectedValue(new EnCurso("ocupado"));

    await expect(
      (await caller()).aplicar(CONFIG_PROXY_POR_DEFECTO),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("aplicar deja pasar otros errores y rechaza configuraciones mal formadas", async () => {
    mockLanzar.mockRejectedValue(new Error("BD caída"));
    await expect(
      (await caller()).aplicar(CONFIG_PROXY_POR_DEFECTO),
    ).rejects.toThrow("BD caída");

    await expect(
      (await caller()).aplicar({
        ...CONFIG_PROXY_POR_DEFECTO,
        logNivel: "TRACE",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("log devuelve las últimas líneas de Traefik o explica por qué no", async () => {
    mockLog.mockResolvedValueOnce("INF Starting provider");
    expect(await (await caller()).log()).toBe("INF Starting provider");

    mockLog.mockRejectedValueOnce(
      new Error("Contenedor Traefik no encontrado"),
    );
    expect(await (await caller()).log()).toMatch(
      /No se pudo leer.*no encontrado/,
    );
  });

  it("sin sesión no deja ni leer", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    await expect((await caller()).obtener()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
