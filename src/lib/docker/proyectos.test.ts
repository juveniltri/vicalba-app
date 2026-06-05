import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStop, mockStart, mockGetContainer } = vi.hoisted(() => ({
  mockStop: vi.fn(),
  mockStart: vi.fn(),
  mockGetContainer: vi.fn(),
}));

vi.mock("dockerode", () => ({
  default: vi.fn().mockImplementation(function () {
    return { getContainer: mockGetContainer };
  }),
}));

vi.mock("@/env", () => ({
  env: { DOCKER_SOCKET_PATH: "/var/run/docker.sock" },
}));

import { DockerError, detenerProyecto, iniciarProyecto } from "./proyectos";

describe("detenerProyecto", () => {
  beforeEach(() => {
    mockGetContainer.mockReturnValue({ stop: mockStop, start: mockStart });
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
    mockGetContainer.mockReturnValue({ stop: mockStop, start: mockStart });
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
