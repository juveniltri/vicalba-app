import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolverRutaSegura, rutaHostVolumen } from "./volumenes";

const base = "/var/vicalba/repos/acme/web/volumes/uploads";

describe("rutaHostVolumen", () => {
  it("construye la ruta del volumen dentro del directorio de repos", () => {
    expect(
      rutaHostVolumen("/var/vicalba/repos", "acme", "web", "uploads"),
    ).toBe(base);
  });
});

describe("resolverRutaSegura", () => {
  it("resuelve rutas dentro del volumen", () => {
    expect(resolverRutaSegura(base, "fotos/a.jpg")).toBe(
      path.resolve(base, "fotos/a.jpg"),
    );
  });

  it("devuelve la raíz del volumen para una ruta vacía", () => {
    expect(resolverRutaSegura(base, "")).toBe(path.resolve(base));
  });

  it.each(["..", "../otro-volumen", "fotos/../../..", "/etc/passwd"])(
    "rechaza %s porque sale del volumen",
    (relativa) => {
      expect(resolverRutaSegura(base, relativa)).toBeNull();
    },
  );

  it("no confunde un volumen con otro cuyo nombre empieza igual", () => {
    expect(resolverRutaSegura(base, "../uploads-privado/x")).toBeNull();
  });

  it.each(["", ".", "fotos/.."])(
    "con permitirRaiz false rechaza «%s» porque apunta a la raíz",
    (relativa) => {
      expect(
        resolverRutaSegura(base, relativa, { permitirRaiz: false }),
      ).toBeNull();
      expect(resolverRutaSegura(base, "fotos", { permitirRaiz: false })).toBe(
        path.resolve(base, "fotos"),
      );
    },
  );
});
