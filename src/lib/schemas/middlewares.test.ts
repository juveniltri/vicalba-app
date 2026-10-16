import { describe, expect, it } from "vitest";
import { middlewaresSchema } from "./middlewares";

describe("middlewaresSchema", () => {
  it("sin middlewares es un objeto vacío", () => {
    expect(middlewaresSchema.parse({})).toEqual({});
  });

  it("acepta la configuración completa", () => {
    const completo = {
      basicAuth: { usuarios: [{ usuario: "cliente", hash: "$2y$05$abc" }] },
      ipPermitidas: ["203.0.113.7", "10.0.0.0/8", "2001:db8::/32"],
      limitePeticiones: { media: 50, rafaga: 100 },
      bodyMaximoMB: 20,
      cabeceras: {
        hsts: true,
        nosniff: true,
        frameDeny: true,
        referrerPolicy: "strict-origin-when-cross-origin",
        propias: { "X-Robots-Tag": "noindex" },
      },
      compresion: true,
      quitarPrefijo: true,
    };
    expect(middlewaresSchema.parse(completo)).toEqual(completo);
  });

  it.each([
    ["IP mal formada", { ipPermitidas: ["300.1.1.1"] }],
    ["rango CIDR fuera de límites", { ipPermitidas: ["10.0.0.0/33"] }],
    ["lista de IPs vacía", { ipPermitidas: [] }],
    [
      "usuario con dos puntos",
      { basicAuth: { usuarios: [{ usuario: "a:b", hash: "x" }] } },
    ],
    ["autenticación sin usuarios", { basicAuth: { usuarios: [] } }],
    [
      "límite de peticiones a cero",
      { limitePeticiones: { media: 0, rafaga: 1 } },
    ],
    ["body de 0 MB", { bodyMaximoMB: 0 }],
    [
      "cabecera propia con salto de línea",
      { cabeceras: { propias: { "X-A": "a\nb" } } },
    ],
    ["nombre de cabecera inválido", { cabeceras: { propias: { "X A": "b" } } }],
    ["clave desconocida", { otra: true }],
  ])("rechaza %s", (_caso, valor) => {
    expect(middlewaresSchema.safeParse(valor).success).toBe(false);
  });
});
