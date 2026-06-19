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

// Estructura real que escribe Traefik: sans: null, campos extra en cada cert
const acmeTraefikReal = JSON.stringify({
  letsencrypt: {
    Account: { Email: "admin@ejemplo.com" },
    Certificates: [
      {
        domain: { main: "app.ejemplo.com", sans: null },
        certificate: "LS0tLS1CRUdJTi...",
        key: "LS0tLS1CRUdJTi...",
        Store: "default",
      },
    ],
  },
});

describe("leerEstadoSSL", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve activo: true si el dominio tiene certificado", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });

  it("devuelve activo: false si el dominio no está en los certificados", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("noexiste.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si acme.json no existe", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si acme.json está malformado", async () => {
    mockReadFile.mockResolvedValue("{ invalid json }");
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si el JSON es válido pero no coincide con el schema", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ letsencrypt: "no-soy-objeto" }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si no hay Certificates en el resolver", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ letsencrypt: { Account: {} } }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: true con la estructura real de Traefik (sans: null, campos extra)", async () => {
    mockReadFile.mockResolvedValue(acmeTraefikReal);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });

  it("devuelve activo: false si el dominio no está en la estructura real de Traefik", async () => {
    mockReadFile.mockResolvedValue(acmeTraefikReal);
    const result = await leerEstadoSSL("otro.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: true con múltiples resolvers y el cert en el segundo", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        myresolver: { Account: {} },
        letsencrypt: {
          Certificates: [
            {
              domain: { main: "app.ejemplo.com", sans: null },
              certificate: "abc",
              key: "abc",
              Store: "default",
            },
          ],
        },
      }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });
});
