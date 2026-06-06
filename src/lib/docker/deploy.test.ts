import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecFile, mockWriteFile, mockMkdir, mockUnlink } = vi.hoisted(
  () => ({
    mockExecFile: vi.fn(),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  unlink: mockUnlink,
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

describe("deployProyecto con variables de entorno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  it("escribe .env.panel y lo pasa como --env-file cuando hay variables", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [
        { clave: "DATABASE_URL", valor: "postgres://localhost/db" },
        { clave: "JWT_SECRET", valor: "supersecret" },
      ],
    });

    const envFilePath = "/var/vicalba/repos/acme/web-app/.env.panel";
    expect(mockWriteFile).toHaveBeenCalledWith(
      envFilePath,
      "DATABASE_URL=postgres://localhost/db\nJWT_SECRET=supersecret",
      "utf-8",
    );

    const dockerCall = vi
      .mocked(mockExecFile)
      .mock.calls.find((c) => c[0] === "docker");
    expect(dockerCall?.[1]).toContain("--env-file");
    expect(dockerCall?.[1]).toContain(envFilePath);
  });

  it("elimina .env.panel en el bloque finally tras deploy exitoso", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [{ clave: "X", valor: "y" }],
    });
    expect(mockUnlink).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env.panel",
    );
  });

  it("elimina .env.panel aunque el deploy falle", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (args[0] === "compose") return cb(new Error("docker error"), "", "");
        return cb(null, "", "");
      },
    );
    await expect(
      deployProyecto({
        ...baseParams,
        variables: [{ clave: "X", valor: "y" }],
      }),
    ).rejects.toThrow();
    expect(mockUnlink).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env.panel",
    );
  });

  it("no escribe .env.panel cuando no hay variables", async () => {
    await deployProyecto(baseParams);
    const writeFileCalls = vi.mocked(mockWriteFile).mock.calls;
    const envFileCall = writeFileCalls.find((c) =>
      String(c[0]).endsWith(".env.panel"),
    );
    expect(envFileCall).toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});

describe("deployProyecto — captura de SHA y path con sha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
  });

  it("sin sha: hace checkout de la rama y retorna el sha capturado", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        if (args[2] === "rev-parse" && args[3] === "HEAD")
          return cb(null, "abc123def456\n", "");
        cb(null, "", "");
      },
    );

    const result = await deployProyecto(baseParams);

    const gitCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "git");
    const checkoutCall = gitCalls.find(([, a]) => a[2] === "checkout");
    expect(checkoutCall?.[1]).toContain("main");
    expect(result.sha).toBe("abc123def456");
  });

  it("con sha: hace fetch y checkout del sha exacto, retorna ese sha", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        if (args[2] === "rev-parse" && args[3] === "HEAD")
          return cb(null, "deadbeef1234\n", "");
        cb(null, "", "");
      },
    );

    const result = await deployProyecto({ ...baseParams, sha: "deadbeef1234" });

    const gitCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "git");
    const fetchCall = gitCalls.find(([, a]) => a[2] === "fetch");
    expect(fetchCall).toBeDefined();
    const checkoutCall = gitCalls.find(([, a]) => a[2] === "checkout");
    expect(checkoutCall?.[1]).toContain("deadbeef1234");
    expect(result.sha).toBe("deadbeef1234");
  });

  it("con sha: no hace git pull explícito después del checkout", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        if (args[2] === "rev-parse" && args[3] === "HEAD")
          return cb(null, "deadbeef\n", "");
        cb(null, "", "");
      },
    );

    await deployProyecto({ ...baseParams, sha: "deadbeef" });

    const gitCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "git");
    // La única llamada pull viene de ensureRepo, no del path sha
    const fetchCalls = gitCalls.filter(([, a]) => a[2] === "fetch");
    // Con sha hay fetch pero no pull explícito después de checkout
    expect(fetchCalls.length).toBeGreaterThan(0);
    const checkoutIdx = gitCalls.findIndex(([, a]) => a[2] === "checkout");
    const pullAfterCheckout = gitCalls
      .slice(checkoutIdx + 1)
      .filter(([, a]) => a[2] === "pull");
    expect(pullAfterCheckout).toHaveLength(0);
  });
});
