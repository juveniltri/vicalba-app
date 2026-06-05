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
  env: { TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic" },
}));

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
