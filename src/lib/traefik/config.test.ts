import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWriteFile, mockUnlink, mockMkdir } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(),
  mockUnlink: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  unlink: mockUnlink,
  mkdir: mockMkdir,
}));

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: mockWarn }) },
}));

vi.mock("@/env", () => ({
  env: { TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic", NODE_ENV: "test" },
}));

import { parse } from "yaml";
import { env } from "@/env";
import {
  generarConfigProyecto,
  generarConfigTraefik,
  escribirConfigTraefik,
  eliminarConfigTraefik,
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
  path: null,
  servicio: null,
  puerto: 3000,
  redireccionWww: "ninguna" as const,
  ...extra,
});

function generar(rutas: ReturnType<typeof ruta>[]) {
  const yaml = generarConfigProyecto({
    clienteSlug: "acme",
    proyectoNombre: "web",
    rutas,
  });
  return { yaml, config: parse(yaml ?? "") as ConfigTraefik };
}

describe("generarConfigProyecto", () => {
  it("una ruta sin servicio enruta su dominio por HTTPS al alias del Proyecto", () => {
    const { yaml, config } = generar([ruta()]);

    expect(yaml?.startsWith("# generado por vicalba-panel\n")).toBe(true);
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

describe("generarConfigTraefik", () => {
  it("genera un router con la regla Host correcta", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });

    expect(yaml).toContain("Host(`app.example.com`)");
  });

  it("activa TLS con certResolver letsencrypt", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });

    expect(yaml).toContain("certResolver");
    expect(yaml).toContain("letsencrypt");
  });

  it("el nombre del servicio sigue la convención clienteSlug-proyectoSlug", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });

    expect(yaml).toContain("cliente-uno-web-app");
  });

  it("usa puerto 80 por defecto en la URL del servidor", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });

    expect(yaml).toContain(":80");
  });

  it("usa el puerto especificado en la URL del servidor", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
      puerto: 3000,
    });

    expect(yaml).toContain(":3000");
    expect(yaml).not.toContain(":80");
  });

  it("elimina backticks y saltos de línea del dominio antes de generar el YAML", () => {
    const yaml = generarConfigTraefik({
      dominio: "app.example.com`\nmalicioso",
      proyectoSlug: "web-app",
      clienteSlug: "cliente-uno",
    });

    // El dominio inyectado queda limpio; la regla Traefik sí usa backticks como delimitadores
    expect(yaml).toContain("app.example.commalicioso");
    expect(yaml).not.toContain("app.example.com`");
    expect(yaml).not.toContain("\nmalicioso");
  });
});

describe("escribirConfigTraefik", () => {
  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it("escribe el fichero en TRAEFIK_DYNAMIC_DIR con nombre proyectoSlug.yml", async () => {
    await escribirConfigTraefik("web-app", "yaml content");

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/etc/traefik/dynamic/web-app.yml",
      "yaml content",
      "utf-8",
    );
  });

  it("crea el directorio si no existe antes de escribir", async () => {
    await escribirConfigTraefik("web-app", "yaml content");

    expect(mockMkdir).toHaveBeenCalledWith("/etc/traefik/dynamic", {
      recursive: true,
    });
  });

  it("avisa por el logger en dev cuando writeFile falla y no relanza el error", async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(
      escribirConfigTraefik("web-app", "yaml"),
    ).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      { code: "ENOENT", dir: "/etc/traefik/dynamic" },
      expect.stringContaining("config de Traefik"),
    );
  });

  it("relanza el error en producción cuando writeFile falla", async () => {
    (env as Record<string, unknown>).NODE_ENV = "production";
    const err = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
    });
    mockWriteFile.mockRejectedValue(err);

    try {
      await expect(escribirConfigTraefik("web-app", "yaml")).rejects.toThrow(
        "Permission denied",
      );
    } finally {
      (env as Record<string, unknown>).NODE_ENV = "test";
    }
  });
});

describe("eliminarConfigTraefik", () => {
  beforeEach(() => {
    mockUnlink.mockResolvedValue(undefined);
  });

  it("elimina el fichero proyectoSlug.yml de TRAEFIK_DYNAMIC_DIR", async () => {
    await eliminarConfigTraefik("web-app");

    expect(mockUnlink).toHaveBeenCalledWith("/etc/traefik/dynamic/web-app.yml");
  });

  it("no lanza error si el fichero no existe (ENOENT)", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    mockUnlink.mockRejectedValue(err);

    await expect(eliminarConfigTraefik("web-app")).resolves.toBeUndefined();
  });

  it("relanza errores que no sean ENOENT", async () => {
    const err = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
    });
    mockUnlink.mockRejectedValue(err);

    await expect(eliminarConfigTraefik("web-app")).rejects.toThrow(
      "Permission denied",
    );
  });
});
