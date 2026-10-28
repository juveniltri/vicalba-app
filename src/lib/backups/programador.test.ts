import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findConfig: vi.fn(),
  findBackup: vi.fn(),
  iniciarCopia: vi.fn(),
  hay: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionBackup: { findUnique: m.findConfig },
    backup: { findFirst: m.findBackup },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("./copia", () => ({ iniciarCopia: m.iniciarCopia }));
vi.mock("./operacion", () => ({ hayOperacionEnCurso: m.hay }));

import { comprobarProgramacion, iniciarProgramador } from "./programador";

const listo = {
  habilitado: true,
  hora: 3,
  claveConfirmadaEn: new Date(),
  repositorioInicializadoEn: new Date(),
};
const ahora = new Date("2026-10-14T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  m.hay.mockReturnValue(false);
  m.findConfig.mockResolvedValue(listo);
  m.findBackup.mockResolvedValue(null);
  m.iniciarCopia.mockResolvedValue({ id: "b1" });
});

describe("comprobarProgramacion", () => {
  it("lanza la copia programada cuando toca", async () => {
    expect(await comprobarProgramacion(ahora)).toBe(true);
    expect(m.findBackup).toHaveBeenCalledWith({
      where: { operacion: "copia", origen: "programado", proyectoId: null },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    expect(m.iniciarCopia).toHaveBeenCalledWith("programado");
  });

  it.each([
    ["deshabilitado", { ...listo, habilitado: false }],
    ["clave sin confirmar", { ...listo, claveConfirmadaEn: null }],
    [
      "repositorio sin inicializar",
      { ...listo, repositorioInicializadoEn: null },
    ],
    ["sin configuración", null],
  ])("no hace nada si está %s", async (_, config) => {
    m.findConfig.mockResolvedValue(config);
    expect(await comprobarProgramacion(ahora)).toBe(false);
    expect(m.iniciarCopia).not.toHaveBeenCalled();
  });

  it("no hace nada con otra operación en curso", async () => {
    m.hay.mockReturnValue(true);
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });

  it("no repite si hoy ya se intentó", async () => {
    m.findBackup.mockResolvedValue({
      iniciadoEn: new Date("2026-10-14T01:00:05Z"),
    });
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });

  it("un error al lanzar no rompe el programador", async () => {
    m.iniciarCopia.mockRejectedValue(
      new Error("Backups sin configurar: no hay destino"),
    );
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });
});

describe("iniciarProgramador", () => {
  it("comprueba cada minuto y no se arranca dos veces", () => {
    vi.useFakeTimers();
    const espia = vi.spyOn(globalThis, "setInterval");
    iniciarProgramador();
    iniciarProgramador();
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith(expect.any(Function), 60_000);
    m.hay.mockReturnValue(true);
    vi.advanceTimersByTime(60_000);
    expect(m.hay).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
