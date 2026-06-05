import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListNetworks, mockCreateNetwork, mockRemove, mockGetNetwork } =
  vi.hoisted(() => {
    const mockRemove = vi.fn();
    const mockGetNetwork = vi.fn(() => ({ remove: mockRemove }));
    return {
      mockListNetworks: vi.fn(),
      mockCreateNetwork: vi.fn(),
      mockRemove,
      mockGetNetwork,
    };
  });

vi.mock("./client", () => ({
  docker: {
    listNetworks: mockListNetworks,
    createNetwork: mockCreateNetwork,
    getNetwork: mockGetNetwork,
  },
}));

import { asegurarRedCliente } from "./networks";

describe("asegurarRedCliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea la red cuando no existe", async () => {
    mockListNetworks.mockResolvedValue([]);

    await asegurarRedCliente("acme");

    expect(mockCreateNetwork).toHaveBeenCalledWith({
      Name: "cliente-acme-network",
      Driver: "bridge",
    });
  });

  it("no crea la red si ya existe (idempotente)", async () => {
    mockListNetworks.mockResolvedValue([
      { Id: "abc", Name: "cliente-acme-network" },
    ]);

    await asegurarRedCliente("acme");

    expect(mockCreateNetwork).not.toHaveBeenCalled();
  });

  it("no confunde redes con nombre similar", async () => {
    mockListNetworks.mockResolvedValue([
      { Id: "abc", Name: "cliente-acme-network-old" },
    ]);

    await asegurarRedCliente("acme");

    expect(mockCreateNetwork).toHaveBeenCalled();
  });
});

import { eliminarRedCliente } from "./networks";

describe("eliminarRedCliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("elimina la red cuando existe", async () => {
    mockListNetworks.mockResolvedValue([
      { Id: "net-id-1", Name: "cliente-beta-network" },
    ]);

    await eliminarRedCliente("beta");

    expect(mockGetNetwork).toHaveBeenCalledWith("net-id-1");
    expect(mockRemove).toHaveBeenCalled();
  });

  it("no hace nada si la red no existe", async () => {
    mockListNetworks.mockResolvedValue([]);

    await eliminarRedCliente("beta");

    expect(mockRemove).not.toHaveBeenCalled();
  });
});
