import { beforeEach, describe, expect, it, vi } from "vitest";

const DIR = "/etc/traefik/dynamic";

// In-memory dynamic directory: tests assert which files end up there.
const { ficheros, fs } = vi.hoisted(() => {
  const ficheros = new Map<string, string>();
  const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  const nombre = (ruta: string) => ruta.split("/").pop() as string;
  return {
    ficheros,
    fs: {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => [...ficheros.keys()]),
      readFile: vi.fn(async (ruta: string) => {
        const contenido = ficheros.get(nombre(ruta));
        if (contenido === undefined) throw enoent();
        return contenido;
      }),
      writeFile: vi.fn(async (ruta: string, contenido: string) => {
        ficheros.set(nombre(ruta), contenido);
      }),
      rm: vi.fn(async (ruta: string, opciones: { force?: boolean }) => {
        if (!ficheros.delete(nombre(ruta)) && !opciones.force) throw enoent();
      }),
    },
  };
});
vi.mock("node:fs/promises", () => fs);

const { mockWarn, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: mockWarn, error: mockError }) },
}));

vi.mock("@/env", () => ({
  env: { TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic", NODE_ENV: "test" },
}));

const { mockClienteFindUnique, mockClienteFindMany } = vi.hoisted(() => ({
  mockClienteFindUnique: vi.fn(),
  mockClienteFindMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: {
      findUnique: mockClienteFindUnique,
      findMany: mockClienteFindMany,
    },
  },
}));

const { mockConectar, mockDesconectar } = vi.hoisted(() => ({
  mockConectar: vi.fn(),
  mockDesconectar: vi.fn(),
}));
vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: mockConectar,
  desconectarTraefikDeRed: mockDesconectar,
}));

const { mockAsegurarRed } = vi.hoisted(() => ({ mockAsegurarRed: vi.fn() }));
vi.mock("@/lib/docker/networks", () => ({
  asegurarRedCliente: mockAsegurarRed,
}));

import { parse } from "yaml";
import { env } from "@/env";
import {
  generarConfigProyecto,
  regenerarConfigTraefik,
  sincronizarTraefikCliente,
} from "./config";

type ConfigTraefik = {
  http: {
    routers: Record<
      string,
      {
        rule: string;
        service: string;
        entryPoints: string[];
        tls: { certResolver: string };
        middlewares?: string[];
      }
    >;
    services: Record<string, { loadBalancer: { servers: { url: string }[] } }>;
    middlewares?: Record<string, unknown>;
  };
};

const ruta = (
  extra: Partial<
    Parameters<typeof generarConfigProyecto>[0]["rutas"][number]
  > = {},
) => ({
  id: "r1",
  dominio: "app.example.com",
  path: "",
  servicio: null,
  puerto: 3000,
  redireccionWww: "ninguna" as const,
  middlewares: {},
  ...extra,
});

function generar(rutas: ReturnType<typeof ruta>[]) {
  const yaml = generarConfigProyecto({
    proyectoId: "p1",
    clienteSlug: "acme",
    proyectoNombre: "web",
    rutas,
  });
  return { yaml, config: parse(yaml ?? "") as ConfigTraefik };
}

describe("generarConfigProyecto", () => {
  it("una ruta sin servicio enruta su dominio por HTTPS al alias del Proyecto", () => {
    const { yaml, config } = generar([ruta()]);

    expect(yaml?.startsWith("# generado por vicalba-panel proyecto=p1\n")).toBe(
      true,
    );
    const routers = Object.values(config.http.routers);
    expect(routers).toHaveLength(1);
    const [router] = routers;
    expect(router.rule).toBe("Host(`app.example.com`)");
    expect(router.entryPoints).toEqual(["websecure"]);
    expect(router.tls).toEqual({ certResolver: "letsencrypt" });
    expect(config.http.services[router.service].loadBalancer.servers).toEqual([
      { url: "http://acme-web:3000" },
    ]);
  });

  it("una ruta con servicio y path enruta ese prefijo al alias del Servicio", () => {
    const { config } = generar([
      ruta({ path: "/api", servicio: "backend", puerto: 8080 }),
    ]);

    const [router] = Object.values(config.http.routers);
    expect(router.rule).toBe("Host(`app.example.com`) && PathPrefix(`/api`)");
    expect(config.http.services[router.service].loadBalancer.servers).toEqual([
      { url: "http://backend.acme-web:8080" },
    ]);
  });

  it("no deja inyectar reglas con comillas invertidas en el dominio o el path", () => {
    const { config } = generar([
      ruta({
        dominio: "a.com`) || Host(`b.com",
        path: "/x`) || PathPrefix(`/",
      }),
    ]);

    const [router] = Object.values(config.http.routers);
    expect(router.rule).toBe(
      "Host(`a.com) || Host(b.com`) && PathPrefix(`/x) || PathPrefix(/`)",
    );
  });

  it("encadena los middlewares de la ruta: primero IP y límite, luego auth, body, prefijo, cabeceras y compresión", () => {
    const { config } = generar([
      ruta({
        path: "/api",
        middlewares: {
          compresion: true,
          cabeceras: {
            hsts: true,
            nosniff: true,
            frameDeny: true,
            referrerPolicy: "no-referrer",
            propias: { "X-Robots-Tag": "noindex" },
          },
          quitarPrefijo: true,
          bodyMaximoMB: 2,
          basicAuth: {
            usuarios: [
              { usuario: "ana", hash: "$2y$05$a" },
              { usuario: "luis", hash: "$2y$05$b" },
            ],
          },
          limitePeticiones: { media: 10, rafaga: 20 },
          ipPermitidas: ["10.0.0.0/8"],
        },
      }),
    ]);

    const [router] = Object.values(config.http.routers);
    const definicion = (i: number) =>
      config.http.middlewares?.[router.middlewares![i]];
    expect(router.middlewares).toHaveLength(7);
    expect(definicion(0)).toEqual({
      ipAllowList: { sourceRange: ["10.0.0.0/8"] },
    });
    expect(definicion(1)).toEqual({
      rateLimit: { average: 10, burst: 20, period: "1s" },
    });
    expect(definicion(2)).toEqual({
      basicAuth: {
        users: ["ana:$2y$05$a", "luis:$2y$05$b"],
        removeHeader: true,
      },
    });
    expect(definicion(3)).toEqual({
      buffering: { maxRequestBodyBytes: 2 * 1024 * 1024 },
    });
    expect(definicion(4)).toEqual({ stripPrefix: { prefixes: ["/api"] } });
    expect(definicion(5)).toEqual({
      headers: {
        stsSeconds: 31536000,
        stsIncludeSubdomains: true,
        contentTypeNosniff: true,
        frameDeny: true,
        referrerPolicy: "no-referrer",
        customResponseHeaders: { "X-Robots-Tag": "noindex" },
      },
    });
    expect(definicion(6)).toEqual({ compress: {} });
  });

  it("sin path no quita prefijo, y una ruta sin middlewares no lleva la clave", () => {
    const { config } = generar([
      ruta({ middlewares: { quitarPrefijo: true } }),
      ruta({ id: "r2", dominio: "b.com" }),
    ]);

    const [conQuitar, sin] = Object.values(config.http.routers);
    expect(conQuitar.middlewares).toBeUndefined();
    expect(sin.middlewares).toBeUndefined();
    expect(config.http.middlewares).toBeUndefined();
  });

  it("sin rutas no genera configuración", () => {
    expect(generar([]).yaml).toBeNull();
  });

  it.each([
    ["a_raiz", "www.example.com", "example.com"],
    ["a_www", "example.com", "www.example.com"],
  ] as const)(
    "redirección %s: router aparte con su propio certificado y 301 al dominio de la ruta",
    (redireccionWww, origen, destino) => {
      const { config } = generar([
        ruta({ dominio: destino, path: "/app", redireccionWww }),
      ]);

      const routers = Object.values(config.http.routers);
      expect(routers).toHaveLength(2);
      const redireccion = routers.find((r) => r.rule === `Host(\`${origen}\`)`);
      expect(redireccion?.tls).toEqual({ certResolver: "letsencrypt" });
      expect(redireccion?.middlewares).toHaveLength(1);
      expect(config.http.middlewares?.[redireccion!.middlewares![0]]).toEqual({
        redirectRegex: {
          regex: `^https?://${origen.replace(/\./g, "\\.")}/(.*)`,
          replacement: `https://${destino}/\${1}`,
          permanent: true,
        },
      });
    },
  );
});

type ProyectoBD = {
  id: string;
  nombre: string;
  rutas: ReturnType<typeof ruta>[];
};

function clienteEnBD(slug: string, proyectos: ProyectoBD[]) {
  return { id: `c-${slug}`, slug, proyectos };
}

describe("sincronizarTraefikCliente", () => {
  beforeEach(() => {
    ficheros.clear();
    vi.clearAllMocks();
  });

  it("escribe <cliente>_<proyecto>.yml para cada Proyecto con rutas y conecta Traefik a la red", async () => {
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [ruta()] }]),
    );

    await sincronizarTraefikCliente("c-acme");

    expect([...ficheros.keys()]).toEqual(["acme_web.yml"]);
    const config = parse(ficheros.get("acme_web.yml")!) as ConfigTraefik;
    expect(Object.values(config.http.routers)[0].rule).toBe(
      "Host(`app.example.com`)",
    );
    expect(mockConectar).toHaveBeenCalledWith("acme");
    // A Cliente never deployed (or a freshly recovered VPS) has no network yet.
    expect(mockAsegurarRed).toHaveBeenCalledWith("acme");
    expect(mockAsegurarRed.mock.invocationCallOrder[0]).toBeLessThan(
      mockConectar.mock.invocationCallOrder[0]!,
    );
    expect(fs.mkdir).toHaveBeenCalledWith(DIR, { recursive: true });
  });

  it("un Proyecto sin rutas pierde su fichero y, si era el último del Cliente, Traefik sale de la red", async () => {
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [ruta()] }]),
    );
    await sincronizarTraefikCliente("c-acme");
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [] }]),
    );

    await sincronizarTraefikCliente("c-acme");

    expect(ficheros.size).toBe(0);
    expect(mockDesconectar).toHaveBeenCalledWith("acme");
  });

  it("sincronizar dos veces deja el mismo fichero", async () => {
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [ruta()] }]),
    );

    await sincronizarTraefikCliente("c-acme");
    await sincronizarTraefikCliente("c-acme");

    expect([...ficheros.keys()]).toEqual(["acme_web.yml"]);
  });

  it("un Cliente que ya no existe no hace nada", async () => {
    mockClienteFindUnique.mockResolvedValue(null);

    await sincronizarTraefikCliente("c-borrado");

    expect(fs.mkdir).not.toHaveBeenCalled();
  });

  it("al renombrar un Proyecto su fichero cambia de nombre", async () => {
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [ruta()] }]),
    );
    await sincronizarTraefikCliente("c-acme");
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "tienda", rutas: [ruta()] }]),
    );

    await sincronizarTraefikCliente("c-acme");

    expect([...ficheros.keys()]).toEqual(["acme_tienda.yml"]);
  });

  it("no toca ficheros manuales, de otros Clientes ni la config global del Proxy", async () => {
    ficheros.set("manual.yml", "http: {}\n");
    ficheros.set("LEEME.txt", "notas");
    ficheros.set("_proxy.yml", "tls: {}\n");
    ficheros.set("acme_viejo.yml", "http: {}\n");
    ficheros.set(
      "otro_api.yml",
      "# generado por vicalba-panel proyecto=p9\nhttp: {}\n",
    );
    mockClienteFindUnique.mockResolvedValue(clienteEnBD("acme", []));

    await sincronizarTraefikCliente("c-acme");

    expect([...ficheros.keys()].sort()).toEqual([
      "LEEME.txt",
      "_proxy.yml",
      "acme_viejo.yml",
      "manual.yml",
      "otro_api.yml",
    ]);
  });

  it("borra el fichero <proyecto>.yml del generador anterior, pero no uno manual con el mismo nombre", async () => {
    ficheros.set(
      "web.yml",
      'http:\n  services:\n    acme-web:\n      loadBalancer:\n        servers:\n          - url: "http://acme-web:80"\n',
    );
    ficheros.set("api.yml", "http: {}\n");
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [
        { id: "p1", nombre: "web", rutas: [ruta()] },
        { id: "p2", nombre: "api", rutas: [] },
      ]),
    );

    await sincronizarTraefikCliente("c-acme");

    expect([...ficheros.keys()].sort()).toEqual(["acme_web.yml", "api.yml"]);
  });

  it("un Cliente que nunca tuvo rutas no toca la red de Traefik", async () => {
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [] }]),
    );

    await sincronizarTraefikCliente("c-acme");

    expect(mockConectar).not.toHaveBeenCalled();
    expect(mockDesconectar).not.toHaveBeenCalled();
  });
});

describe("regenerarConfigTraefik", () => {
  beforeEach(() => {
    ficheros.clear();
    vi.clearAllMocks();
  });

  it("regenera los ficheros de todos los Clientes y borra los generados de Clientes que ya no existen", async () => {
    ficheros.set(
      "borrado_web.yml",
      "# generado por vicalba-panel proyecto=p9\nhttp: {}\n",
    );
    const acme = clienteEnBD("acme", [
      { id: "p1", nombre: "web", rutas: [ruta()] },
    ]);
    const beta = clienteEnBD("beta", [
      { id: "p2", nombre: "api", rutas: [ruta({ dominio: "api.beta.com" })] },
    ]);
    mockClienteFindMany.mockResolvedValue([acme, beta]);
    mockClienteFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        [acme, beta].find((c) => c.id === where.id) ?? null,
    );

    await regenerarConfigTraefik();

    expect([...ficheros.keys()].sort()).toEqual([
      "acme_web.yml",
      "beta_api.yml",
    ]);
  });

  it("si un Cliente falla, lo registra y sigue con los demás", async () => {
    const beta = clienteEnBD("beta", [
      { id: "p2", nombre: "api", rutas: [ruta()] },
    ]);
    mockClienteFindMany.mockResolvedValue([
      { id: "c-acme", slug: "acme" },
      beta,
    ]);
    mockClienteFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === "c-acme") throw new Error("boom");
        return beta;
      },
    );

    await regenerarConfigTraefik();

    expect([...ficheros.keys()]).toEqual(["beta_api.yml"]);
    expect(mockError).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: "c-acme" }),
      expect.any(String),
    );
  });
});

describe("sincronizarTraefikCliente sin directorio escribible", () => {
  beforeEach(() => {
    ficheros.clear();
    vi.clearAllMocks();
    mockClienteFindUnique.mockResolvedValue(
      clienteEnBD("acme", [{ id: "p1", nombre: "web", rutas: [ruta()] }]),
    );
    fs.mkdir.mockRejectedValueOnce(
      Object.assign(new Error("EACCES"), { code: "EACCES" }),
    );
  });

  it("en desarrollo avisa y no falla", async () => {
    await expect(sincronizarTraefikCliente("c-acme")).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });

  it("en producción relanza el error", async () => {
    vi.mocked(env).NODE_ENV = "production";
    try {
      await expect(sincronizarTraefikCliente("c-acme")).rejects.toThrow(
        "EACCES",
      );
    } finally {
      vi.mocked(env).NODE_ENV = "test";
    }
  });
});
