import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLeerFicheroTraefik } = vi.hoisted(() => ({
  mockLeerFicheroTraefik: vi.fn(),
}));

vi.mock("@/lib/docker/traefik", () => ({
  leerFicheroTraefik: mockLeerFicheroTraefik,
}));
vi.mock("@/env", () => ({
  env: { ACME_JSON_PATH: "/letsencrypt/acme.json" },
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
    mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });

  it("lee el fichero desde el contenedor Traefik usando ACME_JSON_PATH", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);
    await leerEstadoSSL("app.ejemplo.com");
    expect(mockLeerFicheroTraefik).toHaveBeenCalledWith(
      "/letsencrypt/acme.json",
    );
  });

  it("devuelve activo: false si el dominio no está en los certificados", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("noexiste.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si no se puede leer el fichero (exec falla, contenedor no encontrado, etc.)", async () => {
    mockLeerFicheroTraefik.mockRejectedValue(
      new Error("Contenedor Traefik no encontrado"),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si acme.json está malformado", async () => {
    mockLeerFicheroTraefik.mockResolvedValue("{ invalid json }");
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si el JSON es válido pero no coincide con el schema", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(
      JSON.stringify({ letsencrypt: "no-soy-objeto" }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: false si no hay Certificates en el resolver", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(
      JSON.stringify({ letsencrypt: { Account: {} } }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: true con la estructura real de Traefik (sans: null, campos extra)", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeTraefikReal);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true });
  });

  it("devuelve activo: false si el dominio no está en la estructura real de Traefik", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeTraefikReal);
    const result = await leerEstadoSSL("otro.com");
    expect(result).toEqual({ activo: false });
  });

  it("devuelve activo: true con múltiples resolvers y el cert en el segundo", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(
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
