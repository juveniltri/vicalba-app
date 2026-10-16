import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_PROXY_POR_DEFECTO } from "@/lib/schemas/proxy";
import { aplicarConfiguracionProxy, type DepsAplicar } from "./aplicar";
import { generarTraefikEstatico } from "./estatico";

const OPCIONES = { acmeStorage: "/letsencrypt/acme.json" };
const ACTUAL = generarTraefikEstatico(CONFIG_PROXY_POR_DEFECTO, OPCIONES);
const NUEVA = { ...CONFIG_PROXY_POR_DEFECTO, logNivel: "DEBUG" as const };

// A fake Traefik: it "starts" only with a static file the test accepts.
function traefikFalso(arrancaCon: (estatico: string | null) => boolean) {
  const disco: { estatico: string | null; previo?: string; tls?: string } = {
    estatico: ACTUAL,
  };
  let enMarcha = true;
  const deps: DepsAplicar = {
    leerEstatico: vi.fn(async () => disco.estatico),
    escribirEstatico: vi.fn(async (c: string) => {
      disco.estatico = c;
    }),
    guardarPrevio: vi.fn(async (c: string) => {
      disco.previo = c;
    }),
    escribirTls: vi.fn(async (c: string) => {
      disco.tls = c;
    }),
    reiniciarTraefik: vi.fn(async () => {
      enMarcha = arrancaCon(disco.estatico);
    }),
    traefikResponde: vi.fn(async () => enMarcha),
    ultimasLineasLog: vi.fn(async () => "ERR field not found, node: logg"),
    esperar: vi.fn(async () => {}),
  };
  return { disco, deps };
}

const aplicar = (deps: DepsAplicar, config = NUEVA) =>
  aplicarConfiguracionProxy(config, OPCIONES, deps, { intentos: 3 });

describe("aplicarConfiguracionProxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica: guarda la anterior en .prev, escribe la nueva, reinicia y espera al ping; el TLS va al final", async () => {
    const { disco, deps } = traefikFalso(() => true);

    expect(await aplicar(deps)).toEqual({ resultado: "aplicada" });

    expect(disco.previo).toBe(ACTUAL);
    expect(disco.estatico).toContain("level: DEBUG");
    expect(disco.tls).toContain("VersionTLS12");
    expect(deps.reiniciarTraefik).toHaveBeenCalledOnce();
  });

  it("si el estático no cambia no reinicia Traefik; solo actualiza el TLS", async () => {
    const { disco, deps } = traefikFalso(() => true);

    expect(
      await aplicar(deps, {
        ...CONFIG_PROXY_POR_DEFECTO,
        tlsMinima: "VersionTLS13",
      }),
    ).toEqual({ resultado: "aplicada" });

    expect(deps.reiniciarTraefik).not.toHaveBeenCalled();
    expect(disco.tls).toContain("VersionTLS13");
  });

  it("espera varios intentos al ping antes de darlo por fallido", async () => {
    const { deps } = traefikFalso(() => true);
    vi.mocked(deps.traefikResponde)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    expect(await aplicar(deps)).toEqual({ resultado: "aplicada" });
    expect(deps.esperar).toHaveBeenCalledTimes(2);
  });

  it("si Traefik no arranca con la nueva, vuelve a la anterior y lo explica con su log", async () => {
    const { disco, deps } = traefikFalso((e) => e === ACTUAL);

    const r = await aplicar(deps);

    expect(r).toMatchObject({
      resultado: "revertida",
      log: "ERR field not found, node: logg",
    });
    expect(r.resultado !== "aplicada" && r.mensaje).toMatch(/anterior/);
    expect(disco.estatico).toBe(ACTUAL);
    expect(disco.tls).toBeUndefined();
    expect(deps.reiniciarTraefik).toHaveBeenCalledTimes(2);
  });

  it("si no arranca ni con la anterior, da error con el acceso de emergencia", async () => {
    const { deps } = traefikFalso(() => false);

    const r = await aplicar(deps);

    expect(r.resultado).toBe("error");
    expect(r.resultado !== "aplicada" && r.mensaje).toMatch(
      /127\.0\.0\.1:3000/,
    );
  });

  it("un ping que falla (conexión rechazada mientras arranca) cuenta como «todavía no»", async () => {
    const { deps } = traefikFalso(() => true);
    vi.mocked(deps.traefikResponde).mockRejectedValueOnce(
      new Error("ECONNREFUSED"),
    );

    expect(await aplicar(deps)).toEqual({ resultado: "aplicada" });
    expect(deps.esperar).toHaveBeenCalledOnce();
  });

  it("un fallo al reiniciar cuenta como que no arranca", async () => {
    const { disco, deps } = traefikFalso(() => true);
    vi.mocked(deps.reiniciarTraefik).mockRejectedValueOnce(
      new Error("docker caído"),
    );

    const r = await aplicar(deps);

    expect(r.resultado).toBe("revertida");
    expect(disco.estatico).toBe(ACTUAL);
  });

  it("la primera vez, sin fichero anterior, un fallo no tiene a qué volver", async () => {
    const { disco, deps } = traefikFalso(() => false);
    disco.estatico = null;

    const r = await aplicar(deps);

    expect(r.resultado).toBe("error");
    expect(deps.guardarPrevio).not.toHaveBeenCalled();
    expect(deps.reiniciarTraefik).toHaveBeenCalledOnce();
  });

  it("si el log de Traefik no se puede leer, lo indica en vez de fallar", async () => {
    const { deps } = traefikFalso((e) => e === ACTUAL);
    vi.mocked(deps.ultimasLineasLog).mockRejectedValue(new Error("x"));

    expect(await aplicar(deps)).toMatchObject({
      resultado: "revertida",
      log: "(no se pudo leer el log de Traefik)",
    });
  });
});
