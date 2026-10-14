import { describe, expect, it } from "vitest";
import { inicioDelDia, proximaCopia, tocaCopia } from "./programacion";

// 14/10/2026 Madrid = UTC+2 (CEST); 14/01/2027 = UTC+1 (CET).
const h = (iso: string) => new Date(iso);

describe("inicioDelDia", () => {
  it("las 03:00 de Madrid en verano son la 01:00 UTC", () => {
    expect(inicioDelDia(h("2026-10-14T12:00:00Z"), 3)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
  it("y en invierno, las 02:00 UTC", () => {
    expect(inicioDelDia(h("2027-01-14T12:00:00Z"), 3)).toEqual(
      h("2027-01-14T02:00:00Z"),
    );
  });
  it("usa el día de Madrid aunque en UTC aún sea el anterior", () => {
    // 23:30 UTC del 13 = 01:30 del 14 en Madrid
    expect(inicioDelDia(h("2026-10-13T23:30:00Z"), 3)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
});

describe("tocaCopia", () => {
  it("no toca antes de la hora", () => {
    expect(tocaCopia(h("2026-10-14T00:59:00Z"), 3, null)).toBe(false);
  });
  it("toca a la hora si hoy no se ha intentado", () => {
    expect(
      tocaCopia(h("2026-10-14T01:00:00Z"), 3, h("2026-10-13T01:00:05Z")),
    ).toBe(true);
  });
  it("Panel parado a las 3: toca al arrancar a las 10", () => {
    expect(
      tocaCopia(h("2026-10-14T08:00:00Z"), 3, h("2026-10-13T01:00:05Z")),
    ).toBe(true);
  });
  it("un reinicio tras la copia de hoy (correcta o fallida) no la repite", () => {
    expect(
      tocaCopia(h("2026-10-14T09:00:00Z"), 3, h("2026-10-14T01:00:05Z")),
    ).toBe(false);
  });
  it("sin ningún intento previo y pasada la hora, toca", () => {
    expect(tocaCopia(h("2026-10-14T09:00:00Z"), 3, null)).toBe(true);
  });
});

describe("proximaCopia", () => {
  it("hoy a la hora si aún no ha llegado", () => {
    expect(proximaCopia(h("2026-10-14T00:30:00Z"), 3, null)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
  it("ahora si toca y no se ha hecho", () => {
    const ahora = h("2026-10-14T09:00:00Z");
    expect(proximaCopia(ahora, 3, h("2026-10-13T01:00:00Z"))).toEqual(ahora);
  });
  it("mañana a la hora si hoy ya se intentó", () => {
    expect(
      proximaCopia(h("2026-10-14T09:00:00Z"), 3, h("2026-10-14T01:00:05Z")),
    ).toEqual(h("2026-10-15T01:00:00Z"));
  });
  it("mañana respeta el cambio de hora (25/10/2026 pasa a CET)", () => {
    expect(
      proximaCopia(h("2026-10-24T09:00:00Z"), 3, h("2026-10-24T01:00:05Z")),
    ).toEqual(h("2026-10-25T02:00:00Z"));
  });
});
