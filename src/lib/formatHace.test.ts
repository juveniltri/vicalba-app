import { afterEach, describe, expect, it, vi } from "vitest";
import { diasHasta, formatHace, shaCorto } from "./formatHace";

describe("formatHace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns minutes when less than 60 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T11:45:00Z"))).toBe("hace 15m");
  });

  it("returns 0m when date is the current time", () => {
    vi.useFakeTimers();
    const now = new Date("2026-06-04T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatHace(now)).toBe("hace 0m");
  });

  it("returns 1h at exactly 60 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T11:00:00Z"))).toBe("hace 1h");
  });

  it("returns hours when between 1 and 23 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T10:00:00Z"))).toBe("hace 2h");
  });

  it("returns 1d at exactly 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-03T12:00:00Z"))).toBe("hace 1d");
  });

  it("returns days when 24 or more hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-02T12:00:00Z"))).toBe("hace 2d");
  });
});

describe("shaCorto", () => {
  it("devuelve los 7 primeros caracteres del commit", () => {
    expect(shaCorto("e881352abcdef0123")).toBe("e881352");
  });

  it("devuelve null si no hay commit", () => {
    expect(shaCorto(null)).toBeNull();
  });
});

describe("diasHasta", () => {
  const ahora = new Date("2026-10-13T12:00:00Z");

  it("cuenta los días completos que faltan", () => {
    expect(diasHasta("2026-10-22T11:00:00Z", ahora)).toBe(8);
  });

  it("devuelve un número negativo si la fecha ya pasó", () => {
    expect(diasHasta("2026-10-10T12:00:00Z", ahora)).toBe(-3);
  });
});
