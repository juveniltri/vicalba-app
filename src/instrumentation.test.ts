import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  limpiarAuxiliares: vi.fn(),
  iniciarProgramador: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureRequestError: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: m.warn, error: m.error }) },
}));
vi.mock("@/lib/sentry", () => ({ initSentry: () => true }));
vi.mock("@/lib/docker/deploys", () => ({
  limpiarDeploysHuerfanos: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/proxy/operacion", () => ({
  limpiarOperacionProxyHuerfana: vi.fn().mockResolvedValue(0),
  asegurarTraefikEstatico: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/traefik/config", () => ({
  regenerarConfigTraefik: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/backups/operacion", () => ({
  limpiarBackupsHuerfanos: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/backups/auxiliar", () => ({
  limpiarAuxiliaresHuerfanos: m.limpiarAuxiliares,
}));
vi.mock("@/lib/backups/programador", () => ({
  iniciarProgramador: m.iniciarProgramador,
}));

import { register } from "./instrumentation";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
});

describe("arranque", () => {
  it("elimina los contenedores auxiliares de backups que quedaron", async () => {
    m.limpiarAuxiliares.mockResolvedValue(2);
    await register();
    expect(m.limpiarAuxiliares).toHaveBeenCalled();
    expect(m.warn).toHaveBeenCalledWith(
      { auxiliares: 2 },
      "Contenedores auxiliares de backups eliminados",
    );
    expect(m.iniciarProgramador).toHaveBeenCalled();
  });

  it("si Docker falla, arranca igual el programador", async () => {
    m.limpiarAuxiliares.mockRejectedValue(new Error("daemon caído"));
    await register();
    expect(m.error).toHaveBeenCalled();
    expect(m.iniciarProgramador).toHaveBeenCalled();
  });
});
