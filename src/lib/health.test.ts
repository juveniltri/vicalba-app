import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw, mockPing, mockEstadoTraefik, mockEstadoCertificados } =
  vi.hoisted(() => ({
    mockQueryRaw: vi.fn(),
    mockPing: vi.fn(),
    mockEstadoTraefik: vi.fn(),
    mockEstadoCertificados: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

vi.mock("@/lib/docker/client", () => ({
  docker: { ping: mockPing },
}));

vi.mock("@/lib/docker/traefik", () => ({ estadoTraefik: mockEstadoTraefik }));
vi.mock("@/lib/ssl/acme", () => ({
  estadoCertificados: mockEstadoCertificados,
}));

import { comprobarSalud } from "./health";

describe("comprobarSalud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEstadoTraefik.mockResolvedValue("ok");
    mockEstadoCertificados.mockResolvedValue("ok");
  });

  it("devuelve status ok cuando DB y Docker responden", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockResolvedValue(undefined);

    const result = await comprobarSalud();

    expect(result.status).toBe("ok");
    expect(result.checks.database).toBe("ok");
    expect(result.checks.docker).toBe("ok");
  });

  it("devuelve degraded con database error cuando DB falla", async () => {
    mockQueryRaw.mockRejectedValue(new Error("Connection refused"));
    mockPing.mockResolvedValue(undefined);

    const result = await comprobarSalud();

    expect(result.status).toBe("degraded");
    expect(result.checks.database).toBe("error");
    expect(result.checks.docker).toBe("ok");
  });

  it("devuelve degraded con docker error cuando Docker falla", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockRejectedValue(new Error("socket hang up"));

    const result = await comprobarSalud();

    expect(result.status).toBe("degraded");
    expect(result.checks.database).toBe("ok");
    expect(result.checks.docker).toBe("error");
  });

  it("incluye el campo version en la respuesta", async () => {
    mockQueryRaw.mockResolvedValue([]);
    mockPing.mockResolvedValue(undefined);

    const result = await comprobarSalud();

    expect(result).toHaveProperty("version");
  });

  it("incluye el estado de Traefik y de los certificados", async () => {
    mockQueryRaw.mockResolvedValue([]);
    mockPing.mockResolvedValue(undefined);

    const result = await comprobarSalud();

    expect(result.checks).toEqual({
      database: "ok",
      docker: "ok",
      proxy: "ok",
      certificados: "ok",
    });
    expect(result.status).toBe("ok");
  });

  it("devuelve degraded si Traefik no está corriendo", async () => {
    mockQueryRaw.mockResolvedValue([]);
    mockPing.mockResolvedValue(undefined);
    mockEstadoTraefik.mockResolvedValue("error");

    const result = await comprobarSalud();

    expect(result.status).toBe("degraded");
    expect(result.checks.proxy).toBe("error");
  });

  it("devuelve degraded si no se pueden leer los certificados", async () => {
    mockQueryRaw.mockResolvedValue([]);
    mockPing.mockResolvedValue(undefined);
    mockEstadoCertificados.mockResolvedValue("error");

    const result = await comprobarSalud();

    expect(result.status).toBe("degraded");
    expect(result.checks.certificados).toBe("error");
  });
});
