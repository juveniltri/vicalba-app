import { PassThrough } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStop, mockStart, mockGetContainer, mockLogs, mockDemuxStream } =
  vi.hoisted(() => ({
    mockStop: vi.fn(),
    mockStart: vi.fn(),
    mockGetContainer: vi.fn(),
    mockLogs: vi.fn(),
    mockDemuxStream: vi.fn(),
  }));

vi.mock("dockerode", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      getContainer: mockGetContainer,
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

describe("detenerProyecto", () => {
  beforeEach(() => {
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(undefined);
  });

  it("stops each container with the correct name", async () => {
    await detenerProyecto("cliente-uno", "web-app", ["nginx", "node"]);

    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-nginx");
    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-node");
    expect(mockStop).toHaveBeenCalledTimes(2);
  });

  it("ignores 304 (container already stopped)", async () => {
    mockStop.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      detenerProyecto("cliente-uno", "web-app", ["nginx"]),
    ).resolves.toBeUndefined();
  });

  it("throws DockerError NOT_FOUND on 404", async () => {
    mockStop.mockRejectedValueOnce({ statusCode: 404 });

    const err = await detenerProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError UNKNOWN on unexpected errors", async () => {
    mockStop.mockRejectedValueOnce(new Error("daemon error"));

    const err = await detenerProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("UNKNOWN");
  });
});

describe("iniciarProyecto", () => {
  beforeEach(() => {
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(undefined);
  });

  it("starts each container with the correct name", async () => {
    await iniciarProyecto("cliente-uno", "web-app", ["nginx", "node"]);

    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-nginx");
    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-node");
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("ignores 304 (container already running)", async () => {
    mockStart.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      iniciarProyecto("cliente-uno", "web-app", ["nginx"]),
    ).resolves.toBeUndefined();
  });

  it("throws DockerError NOT_FOUND on 404", async () => {
    mockStart.mockRejectedValueOnce({ statusCode: 404 });

    const err = await iniciarProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError UNKNOWN on unexpected errors", async () => {
    mockStart.mockRejectedValueOnce(new Error("daemon error"));

    const err = await iniciarProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("UNKNOWN");
  });
});

describe("restartProyecto", () => {
  beforeEach(() => {
    mockGetContainer.mockReturnValue({
      stop: mockStop,
      start: mockStart,
      logs: mockLogs,
    });
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue(undefined);
  });

  it("stops then starts each container with the correct name", async () => {
    await restartProyecto("cliente-uno", "web-app", ["nginx", "node"]);

    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-nginx");
    expect(mockGetContainer).toHaveBeenCalledWith("cliente-uno-web-app-node");
    expect(mockStop).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("ignores 304 on stop (already stopped) and still starts", async () => {
    mockStop.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      restartProyecto("cliente-uno", "web-app", ["nginx"]),
    ).resolves.toBeUndefined();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("ignores 304 on start (already running after stop)", async () => {
    mockStart.mockRejectedValueOnce({ statusCode: 304 });

    await expect(
      restartProyecto("cliente-uno", "web-app", ["nginx"]),
    ).resolves.toBeUndefined();
  });

  it("throws DockerError NOT_FOUND on 404 during stop", async () => {
    mockStop.mockRejectedValueOnce({ statusCode: 404 });

    const err = await restartProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError NOT_FOUND on 404 during start", async () => {
    mockStart.mockRejectedValueOnce({ statusCode: 404 });

    const err = await restartProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

    expect(err).toBeInstanceOf(DockerError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("throws DockerError UNKNOWN on unexpected error during stop", async () => {
    mockStop.mockRejectedValueOnce(new Error("daemon error"));

    const err = await restartProyecto("cliente-uno", "web-app", [
      "nginx",
    ]).catch((e) => e);

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

  it("calls onLine for each log line received from the container", async () => {
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      ["nginx"],
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

  it("streams logs from multiple services with correct servicio label", async () => {
    const streamA = new PassThrough();
    const streamB = new PassThrough();
    mockLogs.mockResolvedValueOnce(streamA).mockResolvedValueOnce(streamB);
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      ["nginx", "node"],
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
    mockLogs.mockRejectedValue({ statusCode: 404 });
    const onLine = vi.fn();
    const controller = new AbortController();

    await expect(
      streamProyectoLogs(
        "cliente-uno",
        "web-app",
        ["nginx"],
        onLine,
        controller.signal,
      ),
    ).resolves.toBeUndefined();

    expect(onLine).not.toHaveBeenCalled();
  });

  it("rethrows non-404 error from container.logs()", async () => {
    mockLogs.mockRejectedValue(new Error("daemon unavailable"));
    const controller = new AbortController();

    await expect(
      streamProyectoLogs(
        "cliente-uno",
        "web-app",
        ["nginx"],
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toThrow("daemon unavailable");
  });

  it("rejects when the log stream emits an error event", async () => {
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      ["nginx"],
      vi.fn(),
      controller.signal,
    );

    mockStream.destroy(new Error("stream broken"));

    await expect(promise).rejects.toThrow("stream broken");
  });

  it("stops streaming when AbortSignal is triggered", async () => {
    const mockStream = new PassThrough();
    mockLogs.mockResolvedValue(mockStream);
    const destroySpy = vi.spyOn(mockStream, "destroy");
    const onLine = vi.fn();
    const controller = new AbortController();

    const promise = streamProyectoLogs(
      "cliente-uno",
      "web-app",
      ["nginx"],
      onLine,
      controller.signal,
    );

    // yield so the async fn registers the abort listener before we abort
    await Promise.resolve();
    controller.abort(); // triggers abort() → destroy() → 'close' → resolve

    await promise;

    expect(destroySpy).toHaveBeenCalled();
  });
});
