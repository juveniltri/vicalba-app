import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile, mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}));
vi.mock("@/env", () => ({
  env: {
    REPOS_DIR: "/var/vicalba/repos",
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
  },
}));

import { deployProyecto } from "./deploy";

const baseParams = {
  repoUrl: "https://github.com/org/repo",
  rama: "main",
  clienteSlug: "acme",
  proyectoNombre: "web-app",
  servicios: ["nginx", "node"],
};

describe("deployProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it("escribe el compose override con la red del cliente y los servicios", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );

    await deployProyecto(baseParams);

    const overridePath =
      "/var/vicalba/repos/acme/web-app/docker-compose.network.yml";
    expect(mockWriteFile).toHaveBeenCalledWith(
      overridePath,
      expect.stringContaining("cliente-acme-network"),
      "utf-8",
    );
    const yaml = vi.mocked(mockWriteFile).mock.calls[0][1] as string;
    expect(yaml).toContain("nginx");
    expect(yaml).toContain("node");
  });

  it("ejecuta docker compose con el override de red", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );

    await deployProyecto(baseParams);

    const composeCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "docker");
    expect(composeCalls.length).toBeGreaterThan(0);
    const composeArgs = composeCalls[composeCalls.length - 1][1] as string[];
    expect(
      composeArgs.some((a) => a.includes("docker-compose.network.yml")),
    ).toBe(true);
  });
});
