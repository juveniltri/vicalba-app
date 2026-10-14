import { describe, expect, it } from "vitest";
import { avisoBackups } from "./aviso";

const ahora = new Date("2026-10-14T12:00:00Z");

describe("avisoBackups", () => {
  it("sin backups habilitados no avisa", () => {
    expect(
      avisoBackups(
        { habilitado: false, ultimaCorrecta: null, ultimoResultado: null },
        ahora,
      ),
    ).toBeNull();
  });
  it("la última copia falló", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-14T01:00:00Z"),
          ultimoResultado: "error",
        },
        ahora,
      ),
    ).toBe("La última copia de seguridad falló");
  });
  it("sin copia correcta en 26 h", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-13T09:00:00Z"),
          ultimoResultado: "exito",
        },
        ahora,
      ),
    ).toBe("Ninguna copia de seguridad correcta en las últimas 26 h");
  });
  it("nunca ha habido copia correcta", () => {
    expect(
      avisoBackups(
        { habilitado: true, ultimaCorrecta: null, ultimoResultado: null },
        ahora,
      ),
    ).toBe("Ninguna copia de seguridad correcta en las últimas 26 h");
  });
  it("todo en orden", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-14T01:00:00Z"),
          ultimoResultado: "exito",
        },
        ahora,
      ),
    ).toBeNull();
  });
});
