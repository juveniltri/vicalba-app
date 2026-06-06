import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListContainers,
  mockGetNetwork,
  mockNetworkConnect,
  mockNetworkDisconnect,
} = vi.hoisted(() => ({
  mockListContainers: vi.fn(),
  mockGetNetwork: vi.fn(),
  mockNetworkConnect: vi.fn(),
  mockNetworkDisconnect: vi.fn(),
}));

vi.mock("./client", () => ({
  docker: {
    listContainers: mockListContainers,
    getNetwork: mockGetNetwork,
  },
}));

vi.mock("@/env", () => ({
  env: {
    TRAEFIK_CONTAINER_NAME: "traefik",
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
    ACME_JSON_PATH: "/var/vicalba/traefik/acme.json",
  },
}));

import { conectarTraefikARed, desconectarTraefikDeRed } from "./traefik";

const mockTraefik = { Id: "abc123", Names: ["/traefik"] };

describe("conectarTraefikARed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockReturnValue({
      connect: mockNetworkConnect,
      disconnect: mockNetworkDisconnect,
    });
  });

  it("conecta Traefik a la red del cliente con el nombre correcto", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkConnect.mockResolvedValue(undefined);

    await conectarTraefikARed("acme");

    expect(mockGetNetwork).toHaveBeenCalledWith("cliente-acme-network");
    expect(mockNetworkConnect).toHaveBeenCalledWith({ Container: "abc123" });
  });

  it("absorbe error si el contenedor ya estaba conectado a la red", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkConnect.mockRejectedValue(
      new Error("already exists in network"),
    );

    await expect(conectarTraefikARed("acme")).resolves.not.toThrow();
  });

  it("propaga errores de conexión distintos de 'already exists'", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    const mockNetwork = {
      connect: vi.fn().mockRejectedValue(new Error("network not found")),
    };
    mockGetNetwork.mockReturnValue(mockNetwork);
    await expect(conectarTraefikARed("acme")).rejects.toThrow(
      "network not found",
    );
  });

  it("no hace nada si no hay contenedor traefik", async () => {
    mockListContainers.mockResolvedValue([]);

    await expect(conectarTraefikARed("acme")).resolves.not.toThrow();
    expect(mockNetworkConnect).not.toHaveBeenCalled();
  });
});

describe("desconectarTraefikDeRed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockReturnValue({
      connect: mockNetworkConnect,
      disconnect: mockNetworkDisconnect,
    });
  });

  it("desconecta Traefik de la red del cliente", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkDisconnect.mockResolvedValue(undefined);

    await desconectarTraefikDeRed("acme");

    expect(mockGetNetwork).toHaveBeenCalledWith("cliente-acme-network");
    expect(mockNetworkDisconnect).toHaveBeenCalledWith({ Container: "abc123" });
  });

  it("absorbe error si no estaba conectado", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkDisconnect.mockRejectedValue(new Error("not connected"));

    await expect(desconectarTraefikDeRed("acme")).resolves.not.toThrow();
  });

  it("propaga errores inesperados", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    const mockNetwork = {
      disconnect: vi.fn().mockRejectedValue(new Error("daemon socket error")),
    };
    mockGetNetwork.mockReturnValue(mockNetwork);
    await expect(desconectarTraefikDeRed("acme")).rejects.toThrow(
      "daemon socket error",
    );
  });

  it("no hace nada si no hay contenedor traefik", async () => {
    mockListContainers.mockResolvedValue([]);

    await expect(desconectarTraefikDeRed("acme")).resolves.not.toThrow();
    expect(mockNetworkDisconnect).not.toHaveBeenCalled();
  });
});
