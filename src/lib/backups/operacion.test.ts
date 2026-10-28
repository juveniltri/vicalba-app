import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateMany, mockElementosUpdateMany } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
  mockElementosUpdateMany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    backup: { updateMany: mockUpdateMany },
    elementoCopia: { updateMany: mockElementosUpdateMany },
  },
}));

import {
  MOTIVO_LIMITE,
  OperacionEnCurso,
  cancelarOperacion,
  hayOperacionEnCurso,
  motivoDeFallo,
  limpiarBackupsHuerfanos,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";

beforeEach(() => {
  soltarOperacion();
  vi.clearAllMocks();
});

describe("operación única", () => {
  it("una segunda operación se rechaza hasta soltar la primera", () => {
    const c = tomarOperacion();
    expect(c).toBeInstanceOf(AbortController);
    expect(hayOperacionEnCurso()).toBe(true);
    expect(() => tomarOperacion()).toThrow(OperacionEnCurso);
    soltarOperacion();
    expect(hayOperacionEnCurso()).toBe(false);
    expect(() => tomarOperacion()).not.toThrow();
  });
});

describe("cancelarOperacion", () => {
  it("aborta la operación en curso con el motivo, sin soltar el bloqueo", () => {
    const c = tomarOperacion();
    expect(cancelarOperacion("Cancelado por ana")).toBe(true);
    expect(c.signal.aborted).toBe(true);
    expect(c.signal.reason).toBe("Cancelado por ana");
    // The operation itself releases the lock once it has stopped.
    expect(hayOperacionEnCurso()).toBe(true);
  });

  it("sin operación en curso devuelve false", () => {
    expect(cancelarOperacion("Cancelado por ana")).toBe(false);
  });
});

describe("motivoDeFallo", () => {
  const abortado = () => new DOMException("aborted", "AbortError");

  it("un proceso abortado da el motivo de la cancelación", () => {
    const c = new AbortController();
    c.abort("Cancelado por ana");
    expect(motivoDeFallo(abortado(), c.signal)).toBe("Cancelado por ana");
  });

  it("y el del límite de tiempo", () => {
    const c = new AbortController();
    c.abort(MOTIVO_LIMITE);
    expect(motivoDeFallo(abortado(), c.signal)).toBe(MOTIVO_LIMITE);
  });

  it("sin motivo de texto, el mensaje del error", () => {
    const c = new AbortController();
    c.abort();
    expect(motivoDeFallo(abortado(), c.signal)).toBe("aborted");
    expect(motivoDeFallo("x", new AbortController().signal)).toBe("x");
  });
});

describe("limpiarBackupsHuerfanos", () => {
  it("marca como error las operaciones en curso de un proceso anterior", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    expect(
      await limpiarBackupsHuerfanos("Interrumpido por reinicio del panel"),
    ).toBe(2);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { resultado: "en_curso" },
      data: {
        resultado: "error",
        error: "Interrumpido por reinicio del panel",
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("cierra también los elementos de copia en curso", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 });
    await limpiarBackupsHuerfanos("Interrumpido");
    expect(mockElementosUpdateMany).toHaveBeenCalledWith({
      where: { resultado: "en_curso" },
      data: { resultado: "error", error: "Interrumpido" },
    });
  });
});
