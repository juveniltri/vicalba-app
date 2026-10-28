import { beforeEach, describe, expect, it, vi } from "vitest";

type Ruta = {
  id: string;
  proyectoId: string;
  dominio: string;
  path: string;
  servicio: string | null;
  puerto: number;
  redireccionWww: "ninguna" | "a_raiz" | "a_www";
  cloudflare?: boolean;
  soloCloudflare?: boolean;
  creadoEn: Date;
};

// In-memory RutaProyecto table: tests assert on the routes that end up stored.
const { rutas, proyectos, mockSincronizar, mockContexto } = vi.hoisted(() => ({
  rutas: [] as Ruta[],
  proyectos: new Map<
    string,
    {
      id: string;
      nombre: string;
      clienteId: string;
      cliente: { slug: string };
      tipo: string;
      puerto: number | null;
    }
  >(),
  mockSincronizar: vi.fn(),
  mockContexto: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    proyecto: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          proyectos.get(where.id) ?? null,
      ),
    },
    rutaProyecto: {
      findMany: vi.fn(
        async ({ where }: { where?: { proyectoId?: string } } = {}) =>
          rutas.filter(
            (r) => !where?.proyectoId || r.proyectoId === where.proyectoId,
          ),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const ruta = rutas.find((r) => r.id === where.id);
        return ruta
          ? { ...ruta, proyecto: proyectos.get(ruta.proyectoId) }
          : null;
      }),
      count: vi.fn(
        async ({ where }: { where: { proyectoId: string } }) =>
          rutas.filter((r) => r.proyectoId === where.proyectoId).length,
      ),
      create: vi.fn(
        async ({ data }: { data: Omit<Ruta, "id" | "creadoEn"> }) => {
          const ruta = {
            middlewares: {},
            ...data,
            id: `r${rutas.length + 1}`,
            creadoEn: new Date(),
          };
          rutas.push(ruta);
          return ruta;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Ruta>;
        }) => {
          const ruta = rutas.find((r) => r.id === where.id)!;
          Object.assign(ruta, data);
          return ruta;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const i = rutas.findIndex((r) => r.id === where.id);
        return rutas.splice(i, 1)[0];
      }),
    },
  },
}));

vi.mock("@/lib/traefik/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/traefik/config")>()),
  sincronizarTraefikCliente: mockSincronizar,
  contextoCloudflare: mockContexto,
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const { mockLeerCertificados } = vi.hoisted(() => ({
  mockLeerCertificados: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/ssl/acme", () => ({ leerCertificados: mockLeerCertificados }));

vi.mock("@/env", () => ({
  env: { PANEL_DOMAIN: "panel.vicalba.com", NODE_ENV: "test" },
}));

import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { createCallerFactory, createContext } from "@/server/trpc";
import { rutasRouter } from "./rutas";

const createCaller = createCallerFactory(rutasRouter);

async function caller() {
  return createCaller(await createContext());
}

function proyecto(
  id: string,
  extra: Partial<{
    tipo: string;
    puerto: number | null;
    clienteId: string;
  }> = {},
) {
  const p = { id, clienteId: "c1", tipo: "compose", puerto: 3000, ...extra };
  proyectos.set(id, { ...p, nombre: id, cliente: { slug: p.clienteId } });
}

beforeEach(() => {
  rutas.length = 0;
  proyectos.clear();
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({
    user: { id: "u1", email: "admin@vicalba.local" },
    expires: "2099-01-01",
  } as never);
  mockContexto.mockResolvedValue({
    resolver: "letsencrypt-dns",
    rangos: ["173.245.48.0/20"],
  });
  proyecto("p1");
});

describe("rutas.crear", () => {
  it("guarda la ruta con el puerto del Proyecto por defecto y sincroniza Traefik del Cliente", async () => {
    await (
      await caller()
    ).crear({ proyectoId: "p1", dominio: "App.Example.com" });

    expect(rutas).toEqual([
      expect.objectContaining({
        proyectoId: "p1",
        dominio: "app.example.com",
        path: "",
        servicio: null,
        puerto: 3000,
        redireccionWww: "ninguna",
      }),
    ]);
    expect(mockSincronizar).toHaveBeenCalledWith("c1");
  });

  it("guarda path, Servicio, puerto y redirección www", async () => {
    await (
      await caller()
    ).crear({
      proyectoId: "p1",
      dominio: "example.com",
      path: "/api",
      servicio: "backend",
      puerto: 8080,
      redireccionWww: "a_raiz",
    });

    expect(rutas[0]).toMatchObject({
      dominio: "example.com",
      path: "/api",
      servicio: "backend",
      puerto: 8080,
      redireccionWww: "a_raiz",
    });
  });

  it("en un Proyecto que no es compose ignora el Servicio y usa 80 si el Proyecto no tiene puerto", async () => {
    proyecto("p2", { tipo: "image", puerto: null });

    await (
      await caller()
    ).crear({
      proyectoId: "p2",
      dominio: "img.example.com",
      servicio: "web",
    });

    expect(rutas[0]).toMatchObject({ servicio: null, puerto: 80 });
  });
});

describe("rutas.crear — dominios ocupados", () => {
  beforeEach(() => proyecto("p2"));

  it("rechaza un dominio y path que ya usa otro Proyecto, pero admite otro path", async () => {
    const api = await caller();
    await api.crear({ proyectoId: "p1", dominio: "example.com" });

    await expect(
      api.crear({ proyectoId: "p2", dominio: "example.com" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await api.crear({ proyectoId: "p2", dominio: "example.com", path: "/api" });

    expect(rutas.map((r) => [r.proyectoId, r.path])).toEqual([
      ["p1", ""],
      ["p2", "/api"],
    ]);
  });

  it("normaliza la barra final del path: «/» es el dominio entero", async () => {
    const api = await caller();
    await api.crear({
      proyectoId: "p1",
      dominio: "example.com",
      path: "/api/",
    });

    await expect(
      api.crear({ proyectoId: "p2", dominio: "example.com", path: "/api" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await api.crear({ proyectoId: "p2", dominio: "otro.com", path: "/" });

    expect(rutas.map((r) => r.path)).toEqual(["/api", ""]);
  });

  it("el host de la redirección www cuenta como ocupado, en los dos sentidos", async () => {
    const api = await caller();
    await api.crear({
      proyectoId: "p1",
      dominio: "example.com",
      redireccionWww: "a_raiz",
    });

    await expect(
      api.crear({ proyectoId: "p2", dominio: "www.example.com", path: "/x" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await api.crear({ proyectoId: "p2", dominio: "app.com" });
    await expect(
      api.crear({
        proyectoId: "p1",
        dominio: "www.app.com",
        redireccionWww: "a_www",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rutas).toHaveLength(2);
  });

  it("rechaza el dominio del Panel, también como host de redirección", async () => {
    const api = await caller();

    await expect(
      api.crear({ proyectoId: "p1", dominio: "panel.vicalba.com" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      api.crear({
        proyectoId: "p1",
        dominio: "www.panel.vicalba.com",
        redireccionWww: "a_www",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rutas).toHaveLength(0);
  });
});

describe("rutas.crear — validación", () => {
  it("no admite más de 20 rutas por Proyecto", async () => {
    const api = await caller();
    for (let i = 0; i < 20; i++)
      await api.crear({ proyectoId: "p1", dominio: `s${i}.example.com` });

    await expect(
      api.crear({ proyectoId: "p1", dominio: "s20.example.com" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rutas).toHaveLength(20);
  });

  it.each([
    ["a_www", "example.com"],
    ["a_raiz", "www.example.com"],
  ] as const)(
    "la redirección %s no tiene sentido con %s",
    async (redireccionWww, dominio) => {
      await expect(
        (await caller()).crear({ proyectoId: "p1", dominio, redireccionWww }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    },
  );

  it("rechaza dominios, paths y Servicios mal formados", async () => {
    const api = await caller();
    for (const entrada of [
      { dominio: "no es un dominio" },
      { dominio: "a.com", path: "api" },
      { dominio: "a.com", path: "/a b" },
      { dominio: "a.com", servicio: "-x" },
      { dominio: "a.com", puerto: 70000 },
    ])
      await expect(
        api.crear({ proyectoId: "p1", ...entrada }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rutas).toHaveLength(0);
  });

  it("falla si el Proyecto no existe", async () => {
    await expect(
      (await caller()).crear({ proyectoId: "nada", dominio: "a.com" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("rutas.editar / eliminar / listar", () => {
  beforeEach(() => proyecto("p2", { clienteId: "c2" }));

  it("editar cambia la ruta sin chocar consigo misma y sincroniza Traefik", async () => {
    const api = await caller();
    const ruta = await api.crear({ proyectoId: "p1", dominio: "example.com" });
    mockSincronizar.mockClear();

    await api.editar({
      id: ruta.id,
      dominio: "example.com",
      path: "/v2",
      servicio: "web",
      puerto: 81,
    });

    expect(rutas).toEqual([
      expect.objectContaining({
        dominio: "example.com",
        path: "/v2",
        servicio: "web",
        puerto: 81,
      }),
    ]);
    expect(mockSincronizar).toHaveBeenCalledWith("c1");
  });

  it("editar no puede quitarle el dominio a otra ruta", async () => {
    const api = await caller();
    await api.crear({ proyectoId: "p2", dominio: "otro.com" });
    const ruta = await api.crear({ proyectoId: "p1", dominio: "example.com" });

    await expect(
      api.editar({ id: ruta.id, dominio: "otro.com" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rutas.map((r) => r.dominio)).toEqual(["otro.com", "example.com"]);
  });

  it("eliminar borra la ruta y sincroniza el Cliente de su Proyecto", async () => {
    const api = await caller();
    const ruta = await api.crear({ proyectoId: "p2", dominio: "otro.com" });
    mockSincronizar.mockClear();

    await api.eliminar({ id: ruta.id });

    expect(rutas).toHaveLength(0);
    expect(mockSincronizar).toHaveBeenCalledWith("c2");
  });

  it("editar o eliminar una ruta que no existe da NOT_FOUND", async () => {
    const api = await caller();
    await expect(
      api.editar({ id: "nada", dominio: "a.com" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(api.eliminar({ id: "nada" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("listar devuelve las rutas del Proyecto y el YAML que recibe Traefik", async () => {
    const api = await caller();
    await api.crear({ proyectoId: "p1", dominio: "example.com" });
    await api.crear({ proyectoId: "p2", dominio: "otro.com" });

    const { rutas: delProyecto, yaml } = await api.listar({ proyectoId: "p1" });

    expect(delProyecto.map((r) => r.dominio)).toEqual(["example.com"]);
    expect(yaml).toContain("Host(`example.com`)");
    expect(yaml).not.toContain("otro.com");
  });

  it("listar incluye el estado del certificado de cada dominio, leyendo acme.json una vez", async () => {
    const api = await caller();
    await api.crear({ proyectoId: "p1", dominio: "con-cert.com" });
    await api.crear({ proyectoId: "p1", dominio: "sin-cert.com" });
    mockLeerCertificados.mockResolvedValue({
      "con-cert.com": { caducaEn: "2026-12-01T00:00:00.000Z" },
    });

    const { rutas: lista } = await api.listar({ proyectoId: "p1" });

    expect(lista.map((r) => r.ssl)).toEqual([
      { activo: true, caducaEn: "2026-12-01T00:00:00.000Z" },
      { activo: false, caducaEn: null },
    ]);
    expect(mockLeerCertificados).toHaveBeenCalledOnce();
  });
});

describe("rutas — casos de borde", () => {
  it("editar en un Proyecto que no es compose ignora el Servicio y conserva el puerto si no se envía", async () => {
    proyecto("p3", { tipo: "nodejs", puerto: 4000 });
    const api = await caller();
    const ruta = await api.crear({
      proyectoId: "p3",
      dominio: "node.com",
      puerto: 9000,
    });

    await api.editar({ id: ruta.id, dominio: "node.com", servicio: "web" });

    expect(rutas[0]).toMatchObject({ servicio: null, puerto: 9000 });
  });

  it("sin PANEL_DOMAIN configurado no hay dominio reservado", async () => {
    const { env } = await import("@/env");
    const anterior = env.PANEL_DOMAIN;
    vi.mocked(env).PANEL_DOMAIN = undefined;
    try {
      await (
        await caller()
      ).crear({ proyectoId: "p1", dominio: "panel.vicalba.com" });
    } finally {
      vi.mocked(env).PANEL_DOMAIN = anterior;
    }
    expect(rutas).toHaveLength(1);
  });
});

it("editar sin Servicio en un compose deja la ruta apuntando al alias del Proyecto", async () => {
  const api = await caller();
  const ruta = await api.crear({
    proyectoId: "p1",
    dominio: "a.com",
    servicio: "web",
  });

  await api.editar({ id: ruta.id, dominio: "a.com" });

  expect(rutas[0].servicio).toBeNull();
});

describe("rutas — Cloudflare", () => {
  it("guarda si la ruta va detrás de Cloudflare y el YAML usa su resolver", async () => {
    const api = await caller();
    const ruta = await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      cloudflare: true,
    });
    expect(rutas[0].cloudflare).toBe(true);
    expect((await api.listar({ proyectoId: "p1" })).yaml).toContain(
      "certResolver: letsencrypt-dns",
    );

    await api.editar({ id: ruta.id, dominio: "a.com" });
    expect(rutas[0].cloudflare).toBe(false);
  });
});

describe("rutas — solo desde Cloudflare", () => {
  const SIN_RANGOS =
    "No hay rangos de Cloudflare aplicados en Configuración → Proxy";

  it("sin Cloudflare la casilla no se guarda", async () => {
    await (
      await caller()
    ).crear({
      proyectoId: "p1",
      dominio: "a.com",
      cloudflare: false,
      soloCloudflare: true,
    });
    expect(rutas[0].soloCloudflare).toBe(false);
  });

  it("con Cloudflare se guarda y listar la devuelve", async () => {
    const api = await caller();
    await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      cloudflare: true,
      soloCloudflare: true,
    });
    expect(rutas[0].soloCloudflare).toBe(true);
    expect((await api.listar({ proyectoId: "p1" })).rutas[0]).toMatchObject({
      soloCloudflare: true,
    });
  });

  it("crear y editar rechazan la casilla si no hay rangos aplicados", async () => {
    const api = await caller();
    const ruta = await api.crear({ proyectoId: "p1", dominio: "a.com" });
    mockContexto.mockResolvedValue({ resolver: "letsencrypt-dns", rangos: [] });
    const datos = { dominio: "a.com", cloudflare: true, soloCloudflare: true };

    await expect(
      api.crear({ proyectoId: "p1", ...datos, dominio: "b.com" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: SIN_RANGOS });
    await expect(api.editar({ id: ruta.id, ...datos })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: SIN_RANGOS,
    });
    expect(rutas).toHaveLength(1);
    expect(rutas[0].soloCloudflare).toBeFalsy();
  });
});

describe("rutas — middlewares", () => {
  it("guarda los middlewares y de la autenticación solo el hash bcrypt ($2y$, coste 5)", async () => {
    const api = await caller();
    await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      middlewares: {
        ipPermitidas: ["10.0.0.0/8"],
        basicAuth: {
          usuarios: [{ usuario: "ana", contrasena: "secreto-largo" }],
        },
      },
    });

    const guardado = rutas[0].middlewares as {
      ipPermitidas: string[];
      basicAuth: { usuarios: { usuario: string; hash: string }[] };
    };
    expect(guardado.ipPermitidas).toEqual(["10.0.0.0/8"]);
    const [ana] = guardado.basicAuth.usuarios;
    expect(ana.usuario).toBe("ana");
    expect(ana.hash).toMatch(/^\$2y\$05\$/);
    expect(bcrypt.compareSync("secreto-largo", ana.hash)).toBe(true);
    expect(JSON.stringify(guardado)).not.toContain("secreto-largo");
  });

  it("listar no devuelve los hashes, solo los usuarios", async () => {
    const api = await caller();
    await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      middlewares: {
        basicAuth: {
          usuarios: [{ usuario: "ana", contrasena: "secreto-largo" }],
        },
      },
    });

    const { rutas: lista, yaml } = await api.listar({ proyectoId: "p1" });

    expect(lista[0].middlewares.basicAuth).toEqual({
      usuarios: [{ usuario: "ana" }],
    });
    // The preview shows who can log in, never the hash (it reaches the browser).
    expect(yaml).toContain("ana:(oculta)");
    expect(yaml).not.toContain("$2y$");
  });

  it("al editar, un usuario sin contraseña nueva conserva la suya; uno nuevo sin contraseña es un error", async () => {
    const api = await caller();
    const ruta = await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      middlewares: {
        basicAuth: {
          usuarios: [{ usuario: "ana", contrasena: "secreto-largo" }],
        },
      },
    });
    const hashAna = (
      rutas[0].middlewares as {
        basicAuth: { usuarios: { hash: string }[] };
      }
    ).basicAuth.usuarios[0].hash;

    await api.editar({
      id: ruta.id,
      dominio: "a.com",
      middlewares: {
        basicAuth: {
          usuarios: [
            { usuario: "ana" },
            { usuario: "luis", contrasena: "otra-clave-1" },
          ],
        },
      },
    });
    const usuarios = (
      rutas[0].middlewares as {
        basicAuth: { usuarios: { usuario: string; hash: string }[] };
      }
    ).basicAuth.usuarios;
    expect(usuarios[0]).toEqual({ usuario: "ana", hash: hashAna });
    expect(bcrypt.compareSync("otra-clave-1", usuarios[1].hash)).toBe(true);

    await expect(
      api.editar({
        id: ruta.id,
        dominio: "a.com",
        middlewares: { basicAuth: { usuarios: [{ usuario: "eva" }] } },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rechaza middlewares mal formados", async () => {
    await expect(
      (await caller()).crear({
        proyectoId: "p1",
        dominio: "a.com",
        middlewares: { ipPermitidas: ["no-es-ip"] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(rutas).toHaveLength(0);
  });

  it("copiar middlewares lleva los de una ruta a otra, hashes incluidos, y sincroniza Traefik", async () => {
    proyecto("p2", { clienteId: "c2" });
    const api = await caller();
    const origen = await api.crear({
      proyectoId: "p1",
      dominio: "a.com",
      middlewares: {
        compresion: true,
        basicAuth: {
          usuarios: [{ usuario: "ana", contrasena: "secreto-largo" }],
        },
      },
    });
    const destino = await api.crear({ proyectoId: "p2", dominio: "b.com" });
    mockSincronizar.mockClear();

    await api.copiarMiddlewares({ desdeId: origen.id, haciaId: destino.id });

    expect(rutas[1].middlewares).toEqual(rutas[0].middlewares);
    expect(mockSincronizar).toHaveBeenCalledWith("c2");
    await expect(
      api.copiarMiddlewares({ desdeId: "nada", haciaId: destino.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
