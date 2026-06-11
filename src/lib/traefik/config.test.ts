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

vi.mock("@/env", () => ({
  env: { TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic", NODE_ENV: "test" },
}));

import { env } from "@/env";
import {
  generarConfigTraefik,
  escribirConfigTraefik,
  eliminarConfigTraefik,
} from "./config";

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

  it("muestra console.warn en dev cuando writeFile falla y no relanza el error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    await expect(
      escribirConfigTraefik("web-app", "yaml"),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[traefik]"));
    warnSpy.mockRestore();
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
