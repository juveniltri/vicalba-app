import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContenedorInspeccionado, Montaje } from "@/lib/docker/inspeccion";

const m = vi.hoisted(() => ({
  inspeccionar: vi.fn(),
  etiquetas: vi.fn(),
  comprobar: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { REPOS_DIR: "/r" } }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: m.warn, error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/lib/docker/inspeccion", () => ({
  inspeccionarProyecto: m.inspeccionar,
  etiquetasVolumen: m.etiquetas,
}));
vi.mock("./rutaSegura", () => ({ comprobarRuta: m.comprobar }));

import { detectarElementos, detectarProyecto } from "./deteccion";
import type { EstadoRuta } from "./rutaSegura";

const ANONIMO = "a".repeat(64);

function bind(origen: string, destino: string, rw = true): Montaje {
  return { tipo: "bind", origen, destino, rw, nombre: null };
}

function volumen(nombre: string, destino: string, rw = true): Montaje {
  return {
    tipo: "volume",
    origen: `/var/lib/docker/volumes/${nombre}/_data`,
    destino,
    rw,
    nombre,
  };
}

function contenedor(
  servicio: string,
  imagen: string,
  montajes: Montaje[],
  extra: Partial<ContenedorInspeccionado> = {},
): ContenedorInspeccionado {
  return {
    id: `id-${servicio}`,
    servicio,
    imagen,
    enMarcha: true,
    env: {},
    montajes,
    ...extra,
  };
}

const crm = (): ContenedorInspeccionado[] => [
  contenedor("db", "postgres:16", [
    bind("/r/c/crm/data/postgres", "/var/lib/postgresql/data"),
  ]),
  contenedor("backend", "ghcr.io/c/crm-backend:latest", [
    bind("/r/c/crm/data/media", "/app/mediafiles"),
    bind("/r/c/crm/data/static", "/app/staticfiles"),
    bind("/r/c/crm/secrets", "/run/secrets", false),
  ]),
  contenedor("worker", "ghcr.io/c/crm-backend:latest", [
    bind("/r/c/crm/data/media", "/app/mediafiles"),
  ]),
  contenedor("frontend", "ghcr.io/c/crm-frontend:latest", [
    bind("/r/c/crm/data/media", "/usr/share/nginx/media", false),
  ]),
  contenedor("redis", "redis:7", [volumen(ANONIMO, "/data")]),
];

let etiquetas: Record<string, Record<string, string>>;
let rutas: Record<string, EstadoRuta>;

const ctx = () => ({
  reposDir: "/r",
  clienteSlug: "c",
  proyectoNombre: "crm",
  etiquetasVolumen: (n: string) => Promise.resolve(etiquetas[n] ?? {}),
  comprobarRuta: (o: string) => Promise.resolve(rutas[o] ?? "ok"),
});

const conDatos = (...montajes: Montaje[]) => [
  contenedor("app", "node:22", montajes),
];

beforeEach(() => {
  vi.clearAllMocks();
  etiquetas = {};
  rutas = {};
});

describe("detectarElementos", () => {
  it("CRM: la BD, la media y los estáticos, una vez cada uno", async () => {
    const r = await detectarElementos(crm(), ctx());
    expect(r).toEqual({
      valida: true,
      elementos: [
        {
          tipo: "bd",
          clave: "bd:db",
          servicio: "db",
          motor: "postgres",
          contenedorId: "id-db",
          enMarcha: true,
        },
        {
          tipo: "datos",
          clave: "datos:./data/media",
          origen: "/r/c/crm/data/media",
          montaje: "bind",
          restaurable: true,
        },
        {
          tipo: "datos",
          clave: "datos:./data/static",
          origen: "/r/c/crm/data/static",
          montaje: "bind",
          restaurable: true,
        },
      ],
      noCopiados: [],
    });
  });

  it("sin contenedores → no válida", async () => {
    expect(await detectarElementos([], ctx())).toEqual({
      valida: false,
      elementos: [],
      noCopiados: [],
    });
  });

  it("un bind fuera de la carpeta del Cliente no se copia", async () => {
    const r = await detectarElementos(conDatos(bind("/etc", "/x")), ctx());
    expect(r.elementos).toEqual([]);
    expect(r.noCopiados).toEqual([
      { origen: "/etc", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("un bind al repo de otro Proyecto del Cliente no se copia", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/otro/data", "/x")),
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/otro/data", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("la carpeta del Cliente tampoco es del Proyecto", async () => {
    const r = await detectarElementos(conDatos(bind("/r/c", "/x")), ctx());
    expect(r.noCopiados).toEqual([
      { origen: "/r/c", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("un `..` en el origen no saca la ruta del filtro", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/../otro/data", "/x")),
      ctx(),
    );
    expect(r.elementos).toEqual([]);
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/otro/data", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("un origen relativo no es del Proyecto", async () => {
    const r = await detectarElementos(
      conDatos(bind("r/c/crm/data", "/x")),
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "r/c/crm/data", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("la raíz del repo no se copia", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/", "/app")),
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/crm", motivo: "Es la raíz del repo" },
    ]);
  });

  it("la raíz de .panel no se copia", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/.panel", "/app")),
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/.panel", motivo: "Es la raíz de .panel" },
    ]);
  });

  it("nada dentro de .git", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/.git/hooks", "/x"), bind("/r/c/crm/.git", "/y")),
      ctx(),
    );
    expect(r.elementos).toEqual([]);
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/crm/.git/hooks", motivo: "Dentro de .git" },
      { origen: "/r/c/crm/.git", motivo: "Dentro de .git" },
    ]);
  });

  it(".panel/data se copia pero no se restaura", async () => {
    const r = await detectarElementos(
      conDatos(bind("/r/c/.panel/data", "/data")),
      ctx(),
    );
    expect(r.elementos).toEqual([
      {
        tipo: "datos",
        clave: "datos:.panel/data",
        origen: "/r/c/.panel/data",
        montaje: "bind",
        restaurable: false,
      },
    ]);
  });

  it("un enlace simbólico en la ruta no se copia", async () => {
    rutas["/r/c/crm/data"] = "enlace";
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/data", "/x")),
      ctx(),
    );
    expect(r.elementos).toEqual([]);
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/crm/data", motivo: "Contiene un enlace simbólico" },
    ]);
  });

  it("un origen que no existe no se copia", async () => {
    rutas["/r/c/crm/data"] = "no_existe";
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/data", "/x")),
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "/r/c/crm/data", motivo: "La carpeta no existe" },
    ]);
  });

  it("un fichero montado no aparece", async () => {
    rutas["/r/c/crm/config.yml"] = "no_carpeta";
    const r = await detectarElementos(
      conDatos(bind("/r/c/crm/config.yml", "/x")),
      ctx(),
    );
    expect(r).toEqual({ valida: true, elementos: [], noCopiados: [] });
  });

  it("solo comprueba en disco los binds que pasan el filtro de texto", async () => {
    const comprobarRuta = vi.fn().mockResolvedValue("ok");
    await detectarElementos(conDatos(bind("/etc", "/x")), {
      ...ctx(),
      comprobarRuta,
    });
    expect(comprobarRuta).not.toHaveBeenCalled();
  });

  it("un volumen con nombre del propio Proyecto se copia", async () => {
    etiquetas.c_crm_uploads = { "com.docker.compose.project": "c-crm" };
    const r = await detectarElementos(
      conDatos(volumen("c_crm_uploads", "/uploads")),
      ctx(),
    );
    expect(r.elementos).toEqual([
      {
        tipo: "datos",
        clave: "volumen:c_crm_uploads",
        origen: "c_crm_uploads",
        montaje: "volume",
        restaurable: true,
      },
    ]);
  });

  it("un volumen sin label o de otro Proyecto no se copia", async () => {
    etiquetas.ajeno = { "com.docker.compose.project": "c-otro" };
    const r = await detectarElementos(
      conDatos(volumen("externo", "/a"), volumen("ajeno", "/b")),
      ctx(),
    );
    expect(r.elementos).toEqual([]);
    expect(r.noCopiados).toEqual([
      { origen: "externo", motivo: "Volumen externo o de otro Proyecto" },
      { origen: "ajeno", motivo: "Volumen externo o de otro Proyecto" },
    ]);
  });

  it("ignora volúmenes anónimos, de solo lectura y otros montajes", async () => {
    const r = await detectarElementos(
      conDatos(
        volumen(ANONIMO, "/a"),
        { ...volumen("c_crm_x", "/b"), nombre: null },
        volumen("c_crm_ro", "/c", false),
        { tipo: "otro", origen: "", destino: "/tmp", rw: true, nombre: null },
      ),
      ctx(),
    );
    expect(r).toEqual({ valida: true, elementos: [], noCopiados: [] });
  });

  it("un mismo origen en varios Servicios es un solo «No se copia»", async () => {
    const r = await detectarElementos(
      [
        contenedor("a", "node:22", [bind("/etc", "/x")]),
        contenedor("b", "node:22", [bind("/etc/", "/y")]),
      ],
      ctx(),
    );
    expect(r.noCopiados).toEqual([
      { origen: "/etc", motivo: "Fuera del Proyecto" },
    ]);
  });

  it("Postgres 18: excluye la carpeta que contiene PGDATA", async () => {
    const r = await detectarElementos(
      [
        contenedor(
          "db",
          "postgres:18",
          [bind("/r/c/crm/data/pg", "/var/lib/postgresql")],
          { env: { PGDATA: "/var/lib/postgresql/18/docker" } },
        ),
      ],
      ctx(),
    );
    expect(r.elementos.map((e) => e.clave)).toEqual(["bd:db"]);
    expect(r.noCopiados).toEqual([]);
  });

  it("Postgres: los demás montajes de la BD sí son datos", async () => {
    const r = await detectarElementos(
      [
        contenedor("db", "postgres:16", [
          bind("/r/c/crm/data/pg", "/var/lib/postgresql/data"),
          bind("/r/c/crm/data/initdb", "/docker-entrypoint-initdb.d"),
        ]),
      ],
      ctx(),
    );
    expect(r.elementos.map((e) => e.clave)).toEqual([
      "bd:db",
      "datos:./data/initdb",
    ]);
  });

  it("el directorio de la BD montado en otro Servicio tampoco es datos", async () => {
    const r = await detectarElementos(
      [
        contenedor("db", "postgres:16", [
          bind("/r/c/crm/data/pg", "/var/lib/postgresql/data"),
        ]),
        contenedor("tools", "alpine:3", [bind("/r/c/crm/data/pg", "/pg")]),
      ],
      ctx(),
    );
    expect(r.elementos.map((e) => e.clave)).toEqual(["bd:db"]);
  });

  it("mariadb: BD MySQL y su /var/lib/mysql excluido", async () => {
    etiquetas.c_crm_mysql = { "com.docker.compose.project": "c-crm" };
    const r = await detectarElementos(
      [
        contenedor(
          "mariadb",
          "mariadb:11",
          [volumen("c_crm_mysql", "/var/lib/mysql/")],
          { enMarcha: false },
        ),
      ],
      ctx(),
    );
    expect(r.elementos).toEqual([
      {
        tipo: "bd",
        clave: "bd:mariadb",
        servicio: "mariadb",
        motor: "mysql",
        contenedorId: "id-mariadb",
        enMarcha: false,
      },
    ]);
    expect(r.noCopiados).toEqual([]);
  });

  it.each([
    ["postgres", "postgres"],
    ["docker.io/library/postgres:16-alpine", "postgres"],
    ["postgis/postgis:16-3.4", "postgres"],
    ["timescale/timescaledb:latest-pg16", "postgres"],
    ["mysql:8.4", "mysql"],
    ["registry.local:5000/mariadb@sha256:abc", "mysql"],
    ["mysql@sha256:abc", "mysql"],
  ])("reconoce la imagen %s como %s", async (imagen, motor) => {
    const r = await detectarElementos([contenedor("x", imagen, [])], ctx());
    expect(r.elementos).toEqual([expect.objectContaining({ motor })]);
  });

  it.each(["redis:7", "ghcr.io/c/postgres-backup:1", "bitnami/mysql-exporter"])(
    "no toma %s por una BD",
    async (imagen) => {
      const r = await detectarElementos([contenedor("x", imagen, [])], ctx());
      expect(r.elementos).toEqual([]);
    },
  );

  it("varias réplicas de un Servicio de BD son un solo elemento, la que está en marcha", async () => {
    const r = await detectarElementos(
      [
        contenedor("db", "postgres:16", [], { id: "parado", enMarcha: false }),
        contenedor("db", "postgres:16", [], { id: "vivo" }),
        contenedor("db", "postgres:16", [], { id: "otro", enMarcha: false }),
      ],
      ctx(),
    );
    expect(r.elementos).toEqual([
      expect.objectContaining({ clave: "bd:db", contenedorId: "vivo" }),
    ]);
  });

  it("acepta un reposDir con barra final", async () => {
    const r = await detectarElementos(conDatos(bind("/r/c/crm/data", "/x")), {
      ...ctx(),
      reposDir: "/r/",
    });
    expect(r.elementos.map((e) => e.clave)).toEqual(["datos:./data"]);
  });
});

describe("detectarProyecto", () => {
  it("inspecciona el Proyecto y comprueba las rutas bajo /hostroot", async () => {
    m.inspeccionar.mockResolvedValue(crm());
    m.comprobar.mockResolvedValue("ok");
    const r = await detectarProyecto("c", "crm");
    expect(m.inspeccionar).toHaveBeenCalledWith("c", "crm");
    expect(m.comprobar).toHaveBeenCalledWith("/r/c/crm/data/media");
    expect(r.elementos.map((e) => e.clave)).toEqual([
      "bd:db",
      "datos:./data/media",
      "datos:./data/static",
    ]);
  });

  it("usa las etiquetas reales de los volúmenes", async () => {
    m.inspeccionar.mockResolvedValue(conDatos(volumen("v", "/v")));
    m.etiquetas.mockResolvedValue({ "com.docker.compose.project": "c-crm" });
    const r = await detectarProyecto("c", "crm");
    expect(m.etiquetas).toHaveBeenCalledWith("v");
    expect(r.elementos.map((e) => e.clave)).toEqual(["volumen:v"]);
  });

  it("si Docker falla, la detección no es válida y se avisa", async () => {
    m.inspeccionar.mockRejectedValue(new Error("connect ENOENT"));
    expect(await detectarProyecto("c", "crm")).toEqual({
      valida: false,
      elementos: [],
      noCopiados: [],
    });
    expect(m.warn).toHaveBeenCalled();
  });
});
