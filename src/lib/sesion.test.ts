import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { sesionVigente } from "./sesion";

const cambioPassword = new Date("2026-10-10T10:00:00Z");

describe("sesionVigente", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      sesionesDesde: cambioPassword,
    } as never);
  });

  it("acepta una sesión iniciada después del último cambio de contraseña", async () => {
    const token = { sub: "u1", iniciadaEn: cambioPassword.getTime() + 1000 };
    expect(await sesionVigente(token)).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { sesionesDesde: true },
    });
  });

  it("rechaza la sesión de un usuario eliminado", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const token = { sub: "u1", iniciadaEn: cambioPassword.getTime() + 1000 };
    expect(await sesionVigente(token)).toBe(false);
  });

  it("rechaza una sesión iniciada antes de cambiar la contraseña", async () => {
    const token = { sub: "u1", iniciadaEn: cambioPassword.getTime() - 1000 };
    expect(await sesionVigente(token)).toBe(false);
  });

  it("rechaza los tokens anteriores a esta comprobación, sin usuario o sin fecha de inicio", async () => {
    expect(await sesionVigente({ sub: "u1" })).toBe(false);
    expect(await sesionVigente({ sub: "u1", iniciadaEn: "ayer" })).toBe(false);
    expect(await sesionVigente({ iniciadaEn: Date.now() })).toBe(false);
  });
});
