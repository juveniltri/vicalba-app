import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw, mockPing } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockPing: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

vi.mock("@/lib/docker/client", () => ({
  docker: { ping: mockPing },
}));

import { comprobarSalud } from "./health";

describe("comprobarSalud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
