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

let leerCertificados: typeof import("./acme").leerCertificados;
let leerEstadoSSL: typeof import("./acme").leerEstadoSSL;

// The module caches acme.json: a fresh copy per test keeps them independent.
beforeEach(async () => {
  vi.resetModules();
  ({ leerCertificados, leerEstadoSSL } = await import("./acme"));
});

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

// Certificado autofirmado real (CN=app.ejemplo.com), caduca 2026-11-11T23:12:51Z
const CERT_B64 =
  "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tDQpNSUlCaURDQ0FTK2dBd0lCQWdJVVJNaU93eDM3bXZjL0lmVGIvOVBNR2dCZ0lGNHdDZ1lJS29aSXpqMEVBd0l3DQpHakVZTUJZR0ExVUVBd3dQWVhCd0xtVnFaVzF3Ykc4dVkyOXRNQjRYRFRJMk1UQXhNakl6TVRJMU1Wb1hEVEkyDQpNVEV4TVRJek1USTFNVm93R2pFWU1CWUdBMVVFQXd3UFlYQndMbVZxWlcxd2JHOHVZMjl0TUZrd0V3WUhLb1pJDQp6ajBDQVFZSUtvWkl6ajBEQVFjRFFnQUVqUjkxaU1DWldFbUlmYkcxQTNudFY5Y3dJcVArT2FlYkpYU1d1bnliDQpyeHpKdnl3RmZGc014SWNENDc0SGxCRi9ydzg2Nm4wb1dOQWI5ckF5and3Vjc2TlRNRkV3SFFZRFZSME9CQllFDQpGQnBSRkYzdDZ3RC9wZ3R5SXI1aWJRQ2lKWEdrTUI4R0ExVWRJd1FZTUJhQUZCcFJGRjN0NndEL3BndHlJcjVpDQpiUUNpSlhHa01BOEdBMVVkRXdFQi93UUZNQU1CQWY4d0NnWUlLb1pJemowRUF3SURSd0F3UkFJZ1o1bzJpQW5LDQpwa1RpYlR4RzBlY252MDZhMWovZGlnZEFqaTF5cUtjZFpzTUNJR1lXZUxVYzJOSWMwTlh5bHYwNmZRaVc4akNRDQpkb0dHclRrdjRBYUY1VVBuDQotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tDQo=";

describe("leerCertificados", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve la fecha de caducidad de cada dominio leyendo acme.json una sola vez", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(
      JSON.stringify({
        letsencrypt: {
          Certificates: [
            {
              domain: { main: "app.ejemplo.com", sans: ["www.ejemplo.com"] },
              certificate: CERT_B64,
            },
          ],
        },
      }),
    );

    const certs = await leerCertificados();

    expect(certs).toEqual({
      "app.ejemplo.com": { caducaEn: "2026-11-11T23:12:51.000Z" },
      "www.ejemplo.com": { caducaEn: "2026-11-11T23:12:51.000Z" },
    });
    expect(mockLeerFicheroTraefik).toHaveBeenCalledOnce();
  });

  it("marca caducaEn null si el certificado no se puede leer", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeTraefikReal);

    await expect(leerCertificados()).resolves.toEqual({
      "app.ejemplo.com": { caducaEn: null },
    });
  });

  it("acepta certificados sin sans ni contenido (caducaEn null)", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);

    await expect(leerCertificados()).resolves.toEqual({
      "app.ejemplo.com": { caducaEn: null },
      "otro.ejemplo.com": { caducaEn: null },
    });
  });

  it("ignora resolvers sin certificados", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(
      JSON.stringify({ letsencrypt: { Account: {} } }),
    );

    await expect(leerCertificados()).resolves.toEqual({});
  });

  it("devuelve un objeto vacío si no se puede leer acme.json", async () => {
    mockLeerFicheroTraefik.mockRejectedValue(new Error("no such container"));

    await expect(leerCertificados()).resolves.toEqual({});
  });

  it("devuelve un objeto vacío si acme.json no tiene el formato esperado", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(JSON.stringify({ x: 1 }));

    await expect(leerCertificados()).resolves.toEqual({});
  });
});

describe("caché de acme.json", () => {
  beforeEach(() => vi.clearAllMocks());

  it("comparte una sola lectura entre llamadas simultáneas", async () => {
    mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);

    const resultados = await Promise.all([
      ...Array.from({ length: 5 }, () => leerCertificados()),
      leerEstadoSSL("app.ejemplo.com"),
    ]);

    expect(mockLeerFicheroTraefik).toHaveBeenCalledTimes(1);
    expect(resultados[0]).toHaveProperty("app.ejemplo.com");
    expect(resultados[5]).toEqual({ activo: true });
  });

  it("reutiliza la lectura durante 60 s y vuelve a leer después", async () => {
    vi.useFakeTimers();
    try {
      mockLeerFicheroTraefik.mockResolvedValue(acmeConCerts);

      await leerCertificados();
      vi.advanceTimersByTime(59_000);
      await leerEstadoSSL("app.ejemplo.com");
      expect(mockLeerFicheroTraefik).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2_000);
      await leerCertificados();
      expect(mockLeerFicheroTraefik).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no guarda los fallos: la siguiente llamada vuelve a intentarlo", async () => {
    mockLeerFicheroTraefik
      .mockRejectedValueOnce(new Error("Tiempo de espera agotado"))
      .mockResolvedValueOnce(acmeConCerts);

    expect(await leerCertificados()).toEqual({});
    expect(await leerCertificados()).toHaveProperty("app.ejemplo.com");
    expect(mockLeerFicheroTraefik).toHaveBeenCalledTimes(2);
  });
});
