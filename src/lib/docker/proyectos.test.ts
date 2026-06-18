import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockStop,
  mockStart,
  mockRestart,
  mockGetContainer,
  mockLogs,
  mockDemuxStream,
  mockListContainers,
} = vi.hoisted(() => ({
  mockStop: vi.fn(),
  mockStart: vi.fn(),
  mockRestart: vi.fn(),
  mockGetContainer: vi.fn(),
  mockLogs: vi.fn(),
  mockDemuxStream: vi.fn(),
  mockListContainers: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getContainer: mockGetContainer,
      listContainers: mockListContainers,
      modem: { demuxStream: mockDemuxStream },
    };
  }),
}));

vi.mock("@/env", () => ({
  env: { DOCKER_SOCKET_PATH: "/var/run/docker.sock" },
}));

import {
  DockerError,
  detenerProyecto,
  iniciarProyecto,
  restartProyecto,
  streamProyectoLogs,
} from "./proyectos";

const makeContainer = (
  id: string,
  serviceName: string,
  extraLabels: Record<string, string> = {},
) => ({
  Id: id,
  Names: [`/${id}`],
  Labels: {
    "com.docker.compose.project": "cliente-uno-web-app",
    "com.docker.compose.service": serviceName,
    ...extraLabels,
  },
});

describe("detenerProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(undefined);
  });

  it("queries containers by compose project label", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    await detenerProyecto("cliente-uno", "web-app");

    expect(mockListContainers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          label: ["com.docker.compose.project=cliente-uno-web-app"],
        },
      }),
    );
  });

  it("stops each container found by label", async () => {
    mockListContainers.mockResolvedValue([
      makeContainer("c1", "nginx"),
      makeContainer("c2", "node"),
    ]);
    await detenerProyecto("cliente-uno", "web-app");

    expect(mockGetContainer).toHaveBeenCalledWith("c1");
    expect(mockGetContainer).toHaveBeenCalledWith("c2");
    expect(mockStop).toHaveBeenCalledTimes(2);
  });

  it("ignores 304 (container already stopped)", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStop.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      detenerProyecto("cliente-uno", "web-app"),
    ).resolves.toBeUndefined();
  });

  it("throws DockerError NOT_FOUND on 404", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStop.mockRejectedValueOnce({ statusCode: 404 });

    const err = await detenerProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError UNKNOWN on unexpected errors", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStop.mockRejectedValueOnce(new Error("daemon error"));

    const err = await detenerProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("UNKNOWN");
  });

  it("does nothing when no containers found", async () => {
    mockListContainers.mockResolvedValue([]);
    await expect(
      detenerProyecto("cliente-uno", "web-app"),
    ).resolves.toBeUndefined();
    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe("iniciarProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(undefined);
  });

  it("queries all containers (including stopped) by compose project label", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    await iniciarProyecto("cliente-uno", "web-app");

    expect(mockListContainers).toHaveBeenCalledWith(
      expect.objectContaining({ all: true }),
    );
  });

  it("starts each container found by label", async () => {
    mockListContainers.mockResolvedValue([
      makeContainer("c1", "nginx"),
      makeContainer("c2", "node"),
    ]);
    await iniciarProyecto("cliente-uno", "web-app");

    expect(mockGetContainer).toHaveBeenCalledWith("c1");
    expect(mockGetContainer).toHaveBeenCalledWith("c2");
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("ignores 304 (container already running)", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStart.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      iniciarProyecto("cliente-uno", "web-app"),
    ).resolves.toBeUndefined();
  });

  it("throws DockerError NOT_FOUND on 404", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStart.mockRejectedValueOnce({ statusCode: 404 });

    const err = await iniciarProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError UNKNOWN on unexpected errors", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockStart.mockRejectedValueOnce(new Error("daemon error"));

    const err = await iniciarProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("UNKNOWN");
  });
});

describe("restartProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      restart: mockRestart,
      logs: mockLogs,
    });
    mockRestart.mockResolvedValue(undefined);
  });

  it("llama a restart en cada contenedor en marcha", async () => {
    mockListContainers.mockResolvedValue([
      makeContainer("c1", "nginx"),
      makeContainer("c2", "node"),
    ]);
    await restartProyecto("cliente-uno", "web-app");

    expect(mockGetContainer).toHaveBeenCalledWith("c1");
    expect(mockGetContainer).toHaveBeenCalledWith("c2");
    expect(mockRestart).toHaveBeenCalledTimes(2);
    expect(mockStop).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("solo consulta contenedores en marcha (all=false)", async () => {
    mockListContainers.mockResolvedValue([]);
    await restartProyecto("cliente-uno", "web-app");

    expect(mockListContainers).toHaveBeenCalledWith(
      expect.objectContaining({ all: false }),
    );
  });

  it("ignora 304 en restart", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockRestart.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      restartProyecto("cliente-uno", "web-app"),
    ).resolves.toBeUndefined();
  });

  it("lanza DockerError NOT_FOUND en 404", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockRestart.mockRejectedValueOnce({ statusCode: 404 });

    const err = await restartProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("lanza DockerError UNKNOWN en error inesperado", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockRestart.mockRejectedValueOnce(new Error("daemon error"));

    const err = await restartProyecto("cliente-uno", "web-app").catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("UNKNOWN");
  });
});

describe("streamProyectoLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockDemuxStream.mockImplementation(
      (stream: NodeJS.ReadableStream, stdout: NodeJS.WritableStream) => {
        (stream as PassThrough).pipe(stdout as PassThrough);
      },
    );
  });

  it("calls onLine with service name from compose label", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      onLine,
      controller.signal,
    );

    mockStream.write("server started\n");
    mockStream.write("listening on port 80\n");
    mockStream.end();

    await promise;

    expect(onLine).toHaveBeenCalledWith("nginx", "server started");
    expect(onLine).toHaveBeenCalledWith("nginx", "listening on port 80");
    expect(onLine).toHaveBeenCalledTimes(2);
  });

  it("falls back to container name when compose service label is missing", async () => {
    const containerWithoutServiceLabel = {
      Id: "c1",
      Names: ["/mycontainer"],
      Labels: { "com.docker.compose.project": "cliente-uno-web-app" },
    };
    mockListContainers.mockResolvedValue([containerWithoutServiceLabel]);
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      onLine,
      controller.signal,
    );

    mockStream.write("log line\n");
    mockStream.end();

    await promise;

    expect(onLine).toHaveBeenCalledWith("/mycontainer", "log line");
  });

  it("streams logs from multiple containers with correct service labels", async () => {
    mockListContainers.mockResolvedValue([
      makeContainer("c1", "nginx"),
      makeContainer("c2", "node"),
    ]);
    const streamA = new PassThrough();
    const streamB = new PassThrough();
    mockLogs.mockResolvedValueOnce(streamA).mockResolvedValueOnce(streamB);
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      onLine,
      controller.signal,
    );

    streamA.write("nginx log\n");
    streamA.end();
    streamB.write("node log\n");
    streamB.end();

    await promise;

    expect(onLine).toHaveBeenCalledWith("nginx", "nginx log");
    expect(onLine).toHaveBeenCalledWith("node", "node log");
  });

  it("skips container silently when it is not found (404)", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockLogs.mockRejectedValue({ statusCode: 404 });
    const onLine = vi.fn();
    const controller = new AbortController();

    await expect(
      streamProyectoLogs("cliente-uno", "web-app", onLine, controller.signal),
    ).resolves.toStrictEqual({ sinContenedores: false });

    expect(onLine).not.toHaveBeenCalled();
  });

  it("rethrows non-404 error from container.logs()", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    mockLogs.mockRejectedValue(new Error("daemon unavailable"));
    const controller = new AbortController();

    await expect(
      streamProyectoLogs("cliente-uno", "web-app", vi.fn(), controller.signal),
    ).rejects.toThrow("daemon unavailable");
  });

  it("rejects when the log stream emits an error event", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      vi.fn(),
      controller.signal,
    );

    mockStream.destroy(new Error("stream broken"));

    await expect(promise).rejects.toThrow("stream broken");
  });

  it("stops streaming when AbortSignal is triggered", async () => {
    mockListContainers.mockResolvedValue([makeContainer("c1", "nginx")]);
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const destroySpy = vi.spyOn(mockStream, "destroy");
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      onLine,
      controller.signal,
    );

    // Wait for listProjectContainers + container.logs() to both resolve
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();

    await promise;

    expect(destroySpy).toHaveBeenCalled();
  });

  it("resuelve con sinContenedores:true cuando no hay contenedores activos", async () => {
    mockListContainers.mockResolvedValue([]);
    const controller = new AbortController();

    await expect(
      streamProyectoLogs("cliente-uno", "web-app", vi.fn(), controller.signal),
    ).resolves.toStrictEqual({ sinContenedores: true });
  });
});
