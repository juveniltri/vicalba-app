import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfiguracionProxy } from "@/lib/schemas/proxy";

type Fila = {
  id: string;
  aplicada: unknown;
  pendiente: unknown;
  estado: "aplicada" | "en_curso" | "revertida" | "error";
  mensaje: string | null;
  log: string | null;
};

// One-row ConfiguracionProxy table and a fake Traefik behind the injected deps.
const { bd, traefik } = vi.hoisted(() => ({
  bd: { fila: null as Fila | null },
  traefik: {
    estatico: null as string | null,
    tls: null as string | null,
    arranca: (_estatico: string | null) => true,
    enMarcha: true,
  },
}));

vi.mock("@/lib/prisma", () => {
  const coincide = (where: { estado?: string | { not: string } }) => {
    if (!bd.fila) return false;
    const e = where.estado;
    if (e === undefined) return true;
    return typeof e === "string"
      ? bd.fila.estado === e
      : bd.fila.estado !== e.not;
  };
  return {
    prisma: {
      configuracionProxy: {
        findUnique: vi.fn(async () => bd.fila),
        upsert: vi.fn(
          async ({
            create,
          }: {
            create: Omit<
              Fila,
              "id" | "estado" | "mensaje" | "log" | "pendiente"
            >;
          }) => {
            bd.fila ??= {
              id: "default",
              pendiente: null,
              estado: "aplicada",
              mensaje: null,
              log: null,
              ...create,
            };
            return bd.fila;
          },
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { estado?: string | { not: string } };
            data: Partial<Fila>;
          }) => {
            if (!coincide(where)) return { count: 0 };
            Object.assign(bd.fila!, data);
            return { count: 1 };
          },
        ),
        update: vi.fn(async ({ data }: { data: Partial<Fila> }) =>
          Object.assign(bd.fila!, data),
        ),
      },
    },
  };
});

vi.mock("@/lib/docker/traefik", () => ({
  depsAplicarTraefik: () => ({
    leerEstatico: async () => traefik.estatico,
    escribirEstatico: async (c: string) => {
      traefik.estatico = c;
    },
    guardarPrevio: async () => {},
    escribirTls: async (c: string) => {
      traefik.tls = c;
    },
    reiniciarTraefik: async () => {
      traefik.enMarcha = traefik.arranca(traefik.estatico);
    },
    traefikResponde: async () => traefik.enMarcha,
    ultimasLineasLog: async () => "ERR algo",
    esperar: async () => {},
  }),
}));

vi.mock("@prisma/client", () => ({ Prisma: { DbNull: null } }));

vi.mock("@/env", () => ({
  env: {
    ACME_JSON_PATH: "/letsencrypt/acme.json",
    ACME_EMAIL: "ops@vicalba.com",
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn() }) },
}));

import { CONFIG_PROXY_POR_DEFECTO } from "@/lib/schemas/proxy";
import {
  asegurarTraefikEstatico,
  lanzarAplicacionProxy,
  leerConfiguracionProxy,
  limpiarOperacionProxyHuerfana,
  OperacionProxyEnCurso,
} from "./operacion";

const NUEVA: ConfiguracionProxy = {
  ...CONFIG_PROXY_POR_DEFECTO,
  logNivel: "DEBUG",
};

beforeEach(() => {
  bd.fila = null;
  traefik.estatico = null;
  traefik.tls = null;
  traefik.arranca = () => true;
  traefik.enMarcha = true;
});

describe("leerConfiguracionProxy", () => {
  it("sin nada guardado devuelve los valores por defecto como aplicados", async () => {
    expect(await leerConfiguracionProxy()).toMatchObject({
      aplicada: CONFIG_PROXY_POR_DEFECTO,
      pendiente: null,
      estado: "aplicada",
    });
  });
});

describe("lanzarAplicacionProxy", () => {
  it("marca la operación en curso, la aplica en segundo plano y la deja como aplicada", async () => {
    const { terminado } = await lanzarAplicacionProxy(NUEVA);
    expect(bd.fila).toMatchObject({ estado: "en_curso", pendiente: NUEVA });

    await terminado;

    expect(bd.fila).toMatchObject({
      estado: "aplicada",
      aplicada: NUEVA,
      pendiente: null,
      mensaje: null,
      log: null,
    });
    expect(traefik.estatico).toContain("level: DEBUG");
    expect(traefik.estatico).toContain("email: ops@vicalba.com");
  });

  it("no deja lanzar una segunda mientras hay una en curso", async () => {
    const { terminado } = await lanzarAplicacionProxy(NUEVA);
    await expect(lanzarAplicacionProxy(NUEVA)).rejects.toBeInstanceOf(
      OperacionProxyEnCurso,
    );
    await terminado;
  });

  it("si Traefik no arranca, la aplicada no cambia y queda la pendiente con el motivo", async () => {
    traefik.estatico = "# anterior\n";
    traefik.arranca = (e) => e === "# anterior\n";

    const { terminado } = await lanzarAplicacionProxy(NUEVA);
    await terminado;

    expect(bd.fila).toMatchObject({
      estado: "revertida",
      aplicada: CONFIG_PROXY_POR_DEFECTO,
      pendiente: NUEVA,
      log: "ERR algo",
    });
    expect(bd.fila?.mensaje).toMatch(/anterior/);
    expect(await leerConfiguracionProxy()).toMatchObject({
      estado: "revertida",
      aplicada: CONFIG_PROXY_POR_DEFECTO,
      pendiente: NUEVA,
    });
  });

  it("un error inesperado deja la operación en error, no colgada en curso", async () => {
    traefik.arranca = () => {
      throw new Error("no debería pasar");
    };
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.configuracionProxy.update).mockRejectedValueOnce(
      new Error("BD caída"),
    );

    const { terminado } = await lanzarAplicacionProxy(NUEVA);
    await terminado;

    expect(bd.fila?.estado).toBe("error");
    expect(bd.fila?.mensaje).toMatch(/BD caída/);
  });
});

describe("lanzarAplicacionProxy sin BD", () => {
  it("si ni siquiera puede guardar el error, termina sin lanzar", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.configuracionProxy.update)
      .mockRejectedValueOnce(new Error("BD caída"))
      .mockRejectedValueOnce(new Error("BD caída"));

    const { terminado } = await lanzarAplicacionProxy(NUEVA);

    await expect(terminado).resolves.toBeUndefined();
  });
});

describe("arranque del Panel", () => {
  it("cierra como error una operación que quedó en curso", async () => {
    await lanzarAplicacionProxy(NUEVA);

    expect(await limpiarOperacionProxyHuerfana()).toBe(1);
    expect(bd.fila).toMatchObject({ estado: "error" });
    expect(bd.fila?.mensaje).toMatch(/reinicio del Panel/);
    expect(await limpiarOperacionProxyHuerfana()).toBe(0);
  });

  it("si falta el traefik.yml estático lo escribe con la configuración aplicada; si existe no lo toca", async () => {
    bd.fila = {
      id: "default",
      aplicada: NUEVA,
      pendiente: null,
      estado: "aplicada",
      mensaje: null,
      log: null,
    };

    expect(await asegurarTraefikEstatico()).toBe(true);
    expect(traefik.estatico).toContain("level: DEBUG");
    expect(traefik.tls).toContain("VersionTLS12");

    traefik.estatico = "# a mano\n";
    expect(await asegurarTraefikEstatico()).toBe(false);
    expect(traefik.estatico).toBe("# a mano\n");
  });
});
