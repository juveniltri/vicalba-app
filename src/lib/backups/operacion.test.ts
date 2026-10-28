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
  OperacionEnCurso,
  hayOperacionEnCurso,
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
