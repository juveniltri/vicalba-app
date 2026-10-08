import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListContainers,
  mockGetNetwork,
  mockNetworkConnect,
  mockNetworkDisconnect,
  mockGetContainer,
  mockExec,
  mockExecStart,
  mockExecInspect,
  mockDemuxStream,
} = vi.hoisted(() => ({
  mockListContainers: vi.fn(),
  mockGetNetwork: vi.fn(),
  mockNetworkConnect: vi.fn(),
  mockNetworkDisconnect: vi.fn(),
  mockGetContainer: vi.fn(),
  mockExec: vi.fn(),
  mockExecStart: vi.fn(),
  mockExecInspect: vi.fn(),
  mockDemuxStream: vi.fn(),
}));

vi.mock("./client", () => ({
  docker: {
    listContainers: mockListContainers,
    getNetwork: mockGetNetwork,
    getContainer: mockGetContainer,
    modem: { demuxStream: mockDemuxStream },
  },
}));

vi.mock("@/env", () => ({
  env: {
    TRAEFIK_CONTAINER_NAME: "traefik",
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
    ACME_JSON_PATH: "/letsencrypt/acme.json",
  },
}));

import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
  leerFicheroTraefik,
} from "./traefik";

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

describe("leerFicheroTraefik", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainer.mockReturnValue({ exec: mockExec });
    mockExec.mockResolvedValue({
      start: mockExecStart,
      inspect: mockExecInspect,
    });
    mockExecStart.mockResolvedValue({});
  });

  function mockSalida(stdout: string, stderr = "") {
    mockDemuxStream.mockImplementation(
      (
        _raw: unknown,
        out: { end: (chunk?: Buffer) => void },
        err: { end: (chunk?: Buffer) => void },
      ) => {
        out.end(stdout ? Buffer.from(stdout) : undefined);
        err.end(stderr ? Buffer.from(stderr) : undefined);
      },
    );
  }

  it("ejecuta `cat <ruta>` en el contenedor Traefik y devuelve el stdout", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockExecInspect.mockResolvedValue({ ExitCode: 0 });
    mockSalida('{"letsencrypt":{}}');

    const content = await leerFicheroTraefik("/letsencrypt/acme.json");

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockExec).toHaveBeenCalledWith({
      Cmd: ["cat", "/letsencrypt/acme.json"],
      AttachStdout: true,
      AttachStderr: true,
    });
    expect(content).toBe('{"letsencrypt":{}}');
  });

  it("lanza un error si el contenedor Traefik no existe", async () => {
    mockListContainers.mockResolvedValue([]);

    await expect(leerFicheroTraefik("/letsencrypt/acme.json")).rejects.toThrow(
      /no encontrado/,
    );
    expect(mockExec).not.toHaveBeenCalled();
  });

  it("lanza un error con el stderr si el comando falla (ExitCode != 0)", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockExecInspect.mockResolvedValue({ ExitCode: 1 });
    mockSalida("", "cat: /letsencrypt/acme.json: No such file or directory");

    await expect(leerFicheroTraefik("/letsencrypt/acme.json")).rejects.toThrow(
      /No such file or directory/,
    );
  });

  it("no se cuelga indefinidamente si el exec de Docker nunca responde (timeout)", async () => {
    vi.useFakeTimers();
    try {
      mockListContainers.mockResolvedValue([mockTraefik]);
      // Simula un exec que nunca resuelve (daemon colgado, socket saturado, etc.)
      mockExecStart.mockReturnValue(new Promise(() => {}));

      const promise = leerFicheroTraefik("/letsencrypt/acme.json");
      const assertion = expect(promise).rejects.toThrow(/tiempo|timeout/i);
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
