import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearLimitador } from "./rate-limit";

describe("crearLimitador", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("permite hasta el máximo de intentos por clave dentro de la ventana", () => {
    const limitar = crearLimitador({ max: 3, ventanaMs: 60_000 });

    expect([1, 2, 3].map(() => limitar("1.2.3.4"))).toEqual([
      false,
      false,
      false,
    ]);
    expect(limitar("1.2.3.4")).toBe(true);
  });

  it("cuenta cada clave por separado", () => {
    const limitar = crearLimitador({ max: 1, ventanaMs: 60_000 });

    limitar("1.1.1.1");
    expect(limitar("1.1.1.1")).toBe(true);
    expect(limitar("2.2.2.2")).toBe(false);
  });

  it("vuelve a permitir intentos cuando pasa la ventana", () => {
    const limitar = crearLimitador({ max: 1, ventanaMs: 60_000 });

    limitar("1.2.3.4");
    vi.advanceTimersByTime(59_999);
    expect(limitar("1.2.3.4")).toBe(true);

    vi.advanceTimersByTime(1);
    expect(limitar("1.2.3.4")).toBe(false);
  });

  it("olvida las claves caducadas para no crecer sin límite", () => {
    const limitar = crearLimitador({ max: 1, ventanaMs: 60_000 });

    for (let i = 0; i < 1000; i++) limitar(`10.0.${i >> 8}.${i & 255}`);
    vi.advanceTimersByTime(60_000);
    limitar("1.2.3.4");

    expect(limitar.claves()).toBe(1);
  });
});
