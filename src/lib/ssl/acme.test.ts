import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));
vi.mock("@/env", () => ({
  env: { ACME_JSON_PATH: "/var/vicalba/traefik/acme.json" },
}));

import { leerEstadoSSL } from "./acme";

const acmeConCerts = JSON.stringify({
  letsencrypt: {
    Certificates: [
      { domain: { main: "app.ejemplo.com" } },
      { domain: { main: "otro.ejemplo.com" } },
    ],
  },
});

describe("leerEstadoSSL", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve activo: true si el dominio tiene certificado", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true, expira: null });
  });

  it("devuelve activo: false si el dominio no está en los certificados", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("noexiste.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si acme.json no existe", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si acme.json está malformado", async () => {
    mockReadFile.mockResolvedValue("{ invalid json }");
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si no hay Certificates en el resolver", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ letsencrypt: { Account: {} } }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });
});
