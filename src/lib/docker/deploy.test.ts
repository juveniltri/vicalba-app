import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecFile,
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
  return {
    mockExecFile: execFileMock,
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
    mockListContainers: vi.fn().mockResolvedValue([]),
    mockConnect: vi.fn().mockResolvedValue(undefined),
    mockGetNetwork: vi.fn(),
  };
});

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

const baseParams = {
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

    const composeCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "docker");
    expect(composeCalls.length).toBeGreaterThan(0);
    const composeArgs = composeCalls[composeCalls.length - 1][1] as string[];
    expect(composeArgs).toContain("-p");
    expect(composeArgs).toContain("acme-web-app");
    expect(
      composeArgs.some((a) => a.includes("docker-compose.network.yml")),
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
    expect(mockConnect).toHaveBeenCalledWith({ Container: "c1" });
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
      'DATABASE_URL="postgres://localhost/db"\nJWT_SECRET="supersecret"',
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

  it("escapa comillas dobles y barras invertidas en los valores", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [
        { clave: "PASSWORD", valor: 'p@ss#word"with"quotes' },
        { clave: "PATH_VAR", valor: "C:\\Users\\name" },
      ],
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env.panel",
      'PASSWORD="p@ss#word\\"with\\"quotes"\nPATH_VAR="C:\\\\Users\\\\name"',
      "utf-8",
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
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
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
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  const keyFilePath = "/var/vicalba/repos/acme/web-app/.deploy_key";

  it("escribe la clave privada en .deploy_key con permisos 0o600", async () => {
    await deployProyecto({
      ...baseParams,
      credencial: { clavePrivada: "-----BEGIN RSA PRIVATE KEY-----" },
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      keyFilePath,
      "-----BEGIN RSA PRIVATE KEY-----",
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
