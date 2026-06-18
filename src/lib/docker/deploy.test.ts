import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecFile,
  mockSpawn,
  mockWriteFile,
  mockMkdir,
  mockUnlink,
  mockListContainers,
  mockConnect,
  mockGetNetwork,
} = vi.hoisted(() => {
  const execFileMock = vi.fn();
  // Attach the custom promisify symbol so promisify(execFileMock) returns { stdout, stderr }
  const customSymbol = Symbol.for("nodejs.util.promisify.custom");
  (execFileMock as unknown as Record<symbol, (...args: unknown[]) => unknown>)[
    customSymbol
  ] = (
    cmd: unknown,
    args: unknown,
  ): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      execFileMock(
        cmd,
        args,
        (err: Error | null, stdout: string, stderr: string) => {
          if (err) reject(err);
          else resolve({ stdout, stderr });
        },
      );
    });

  const makeSpawnResult = (exitCode = 0) => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi
      .fn()
      .mockImplementation(
        (event: string, cb: (arg: unknown) => void) =>
          event === "close" && setImmediate(() => cb(exitCode)),
      ),
  });
  const spawnMock = vi.fn().mockImplementation(() => makeSpawnResult(0));
  (spawnMock as unknown as { _make: typeof makeSpawnResult })._make =
    makeSpawnResult;

  return {
    mockExecFile: execFileMock,
    mockSpawn: spawnMock,
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
    mockListContainers: vi.fn().mockResolvedValue([]),
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockGetNetwork: vi.fn(),
  };
});

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  spawn: mockSpawn,
}));
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  unlink: mockUnlink,
}));
vi.mock("@/env", () => ({
  env: {
    REPOS_DIR: "/var/vicalba/repos",
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
    NODE_ENV: "test",
  },
}));
vi.mock("dockerode", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      listContainers: mockListContainers,
      getNetwork: mockGetNetwork,
    };
  }),
}));

import { deployProyecto } from "./deploy";

const makeSpawnResult = (
  mockSpawn as unknown as { _make: (exitCode?: number) => object }
)._make;

const baseParams = {
  tipo: "compose",
  repoUrl: "https://github.com/org/repo",
  rama: "main",
  clienteSlug: "acme",
  proyectoNombre: "web-app",
};

describe("deployProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
    mockSpawn.mockImplementation(() => makeSpawnResult(0));
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  it("ejecuta docker compose con -p projectSlug y sin override de red", async () => {
    await deployProyecto(baseParams);

    expect(mockSpawn).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining(["-p", "acme-web-app"]),
      expect.anything(),
    );
    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    expect(
      spawnArgs.some((a) => a.includes("docker-compose.network.yml")),
    ).toBe(false);
  });

  it("no escribe ningún archivo override de red", async () => {
    await deployProyecto(baseParams);

    const writeFileCalls = vi.mocked(mockWriteFile).mock.calls;
    const overrideCall = writeFileCalls.find((c) =>
      String(c[0]).includes("network.yml"),
    );
    expect(overrideCall).toBeUndefined();
  });

  it("conecta los contenedores del proyecto a la red del cliente tras el deploy", async () => {
    mockListContainers.mockResolvedValue([{ Id: "c1", Names: ["/web"] }]);

    await deployProyecto(baseParams);

    expect(mockListContainers).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: {
          label: ["com.docker.compose.project=acme-web-app"],
        },
      }),
    );
    expect(mockConnect).toHaveBeenCalledWith({
      Container: "c1",
      EndpointConfig: { Aliases: ["acme-web-app"] },
    });
  });

  it("ignora silenciosamente el error 'already exists' al conectar a la red", async () => {
    mockListContainers.mockResolvedValue([{ Id: "c1", Names: ["/web"] }]);
    mockConnect.mockRejectedValueOnce(new Error("already exists in network"));

    await expect(deployProyecto(baseParams)).resolves.toBeDefined();
  });
});

describe("deployProyecto con variables de entorno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
    mockSpawn.mockImplementation(() => makeSpawnResult(0));
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  it("escribe .env en el repoDir y no usa --env-file cuando hay variables (tipo compose)", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [
        { clave: "DATABASE_URL", valor: "postgres://localhost/db" },
        { clave: "JWT_SECRET", valor: "supersecret" },
      ],
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env",
      "DATABASE_URL=postgres://localhost/db\nJWT_SECRET=supersecret",
      { encoding: "utf-8", mode: 0o600 },
    );

    const spawnArgs = mockSpawn.mock.calls[0]?.[1] as string[] | undefined;
    expect(spawnArgs).not.toContain("--env-file");
  });

  it("no elimina el .env del repoDir tras deploy exitoso (se mantiene para reinicios)", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [{ clave: "X", valor: "y" }],
    });
    expect(mockUnlink).not.toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env",
    );
  });

  it("no elimina el .env aunque el deploy falle", async () => {
    mockSpawn.mockImplementationOnce(() => makeSpawnResult(1));

    await expect(
      deployProyecto({
        ...baseParams,
        variables: [{ clave: "X", valor: "y" }],
      }),
    ).rejects.toThrow();
    expect(mockUnlink).not.toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env",
    );
  });

  it("escribe valores sin escapar en el .env del repoDir (docker compose parsea .env natively)", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [
        { clave: "PASSWORD", valor: 'p@ss#word"with"quotes' },
        { clave: "PATH_VAR", valor: "C:\\Users\\name" },
      ],
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env",
      'PASSWORD=p@ss#word"with"quotes\nPATH_VAR=C:\\Users\\name',
      { encoding: "utf-8", mode: 0o600 },
    );
  });

  it("no escribe .env.panel cuando no hay variables", async () => {
    await deployProyecto(baseParams);
    const writeFileCalls = vi.mocked(mockWriteFile).mock.calls;
    const envFileCall = writeFileCalls.find(
      (c) => String(c[0]).includes("/.panel/") && String(c[0]).endsWith(".env"),
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
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
    mockSpawn.mockImplementation(() => makeSpawnResult(0));
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
    const fetchCalls = gitCalls.filter(([, a]) => a[2] === "fetch");
    expect(fetchCalls.length).toBeGreaterThan(0);
    const checkoutIdx = gitCalls.findIndex(([, a]) => a[2] === "checkout");
    const pullAfterCheckout = gitCalls
      .slice(checkoutIdx + 1)
      .filter(([, a]) => a[2] === "pull");
    expect(pullAfterCheckout).toHaveLength(0);
  });

  it("usa stdout.trim() directamente para capturar el sha", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        if (args[2] === "rev-parse" && args[3] === "HEAD")
          return cb(null, "  cafebabe  \n", "");
        cb(null, "", "");
      },
    );

    const result = await deployProyecto(baseParams);
    expect(result.sha).toBe("cafebabe");
  });
});

describe("deployProyecto con credencial SSH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
    mockSpawn.mockImplementation(() => makeSpawnResult(0));
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  const keyFilePath = "/var/vicalba/repos/acme/.panel/web-app.deploy_key";

  it("escribe la clave privada en .deploy_key con permisos 0o600", async () => {
    await deployProyecto({
      ...baseParams,
      credencial: { clavePrivada: "-----BEGIN RSA PRIVATE KEY-----" },
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      keyFilePath,
      "-----BEGIN RSA PRIVATE KEY-----\n",
      { mode: 0o600 },
    );
  });

  it("elimina .deploy_key en el bloque finally tras deploy exitoso", async () => {
    await deployProyecto({
      ...baseParams,
      credencial: { clavePrivada: "key" },
    });

    expect(mockUnlink).toHaveBeenCalledWith(keyFilePath);
  });

  it("elimina .deploy_key aunque el deploy falle", async () => {
    mockSpawn.mockImplementationOnce(() => makeSpawnResult(1));

    await expect(
      deployProyecto({ ...baseParams, credencial: { clavePrivada: "key" } }),
    ).rejects.toThrow();

    expect(mockUnlink).toHaveBeenCalledWith(keyFilePath);
  });

  it("no escribe .deploy_key cuando no hay credencial", async () => {
    await deployProyecto(baseParams);

    const writeFileCalls = vi.mocked(mockWriteFile).mock.calls;
    const keyCall = writeFileCalls.find((c) =>
      String(c[0]).endsWith(".deploy_key"),
    );
    expect(keyCall).toBeUndefined();
  });
});
