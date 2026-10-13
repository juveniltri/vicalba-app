import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecFile,
  mockExecFileOpts,
  mockSpawn,
  mockWriteFile,
  mockMkdir,
  mockUnlink,
  mockListContainers,
  mockConnect,
  mockGetNetwork,
  mockReadFile,
} = vi.hoisted(() => {
  const execFileMock = vi.fn();
  const execFileOptsMock = vi.fn();
  // Attach the custom promisify symbol so promisify(execFileMock) returns { stdout, stderr }
  const customSymbol = Symbol.for("nodejs.util.promisify.custom");
  (execFileMock as unknown as Record<symbol, (...args: unknown[]) => unknown>)[
    customSymbol
  ] = (
    cmd: unknown,
    args: unknown,
    opts?: unknown,
  ): Promise<{ stdout: string; stderr: string }> =>
    new Promise((resolve, reject) => {
      execFileOptsMock(cmd, args, opts);
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
    mockExecFileOpts: execFileOptsMock,
    mockSpawn: spawnMock,
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
    mockReadFile: vi.fn().mockResolvedValue(""),
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
  readFile: mockReadFile,
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

  it("anuncia en el log la fase de red y proxy antes de terminar", async () => {
    const onLog = vi.fn();
    await deployProyecto({ ...baseParams, onLog });

    const lineas = onLog.mock.calls.map(([l]) => l as string);
    const red = lineas.indexOf("→ Conectando red y proxy...");
    expect(red).toBeGreaterThan(-1);
    expect(red).toBeLessThan(lineas.indexOf("✓ Deploy completado"));
  });

  it("ignora silenciosamente el error 'already exists' al conectar a la red", async () => {
    mockListContainers.mockResolvedValue([{ Id: "c1", Names: ["/web"] }]);
    mockConnect.mockRejectedValueOnce(new Error("already exists in network"));

    await expect(deployProyecto(baseParams)).resolves.toBeDefined();
  });

  it("solo alía al contenedor que expone el puerto configurado, no a todo el stack", async () => {
    mockListContainers.mockResolvedValue([
      { Id: "c-db", Names: ["/db"], Ports: [{ PrivatePort: 5432 }] },
      { Id: "c-web", Names: ["/web"], Ports: [{ PrivatePort: 8000 }] },
      { Id: "c-worker", Names: ["/worker"], Ports: [] },
    ]);

    await deployProyecto({ ...baseParams, puerto: 8000 });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith({
      Container: "c-web",
      EndpointConfig: { Aliases: ["acme-web-app"] },
    });
  });

  it("distingue por nombre de servicio cuando varios contenedores comparten imagen y puerto expuesto", async () => {
    // web/worker/beat construidos del mismo Dockerfile (EXPOSE 8000) reportan el mismo
    // puerto en Docker aunque solo "web" sirva HTTP — el YAML es la señal fiable.
    mockReadFile.mockResolvedValueOnce(
      [
        "services:",
        "  db:",
        "    image: postgres:16",
        "  web:",
        "    build: ../crm",
        "    expose:",
        '      - "8000"',
        "  worker:",
        "    build: ../crm",
        "    command: celery worker",
        "  beat:",
        "    build: ../crm",
        "    command: celery beat",
      ].join("\n"),
    );
    mockListContainers.mockResolvedValue([
      { Id: "c-db", Labels: { "com.docker.compose.service": "db" } },
      {
        Id: "c-web",
        Labels: { "com.docker.compose.service": "web" },
        Ports: [{ PrivatePort: 8000 }],
      },
      {
        Id: "c-worker",
        Labels: { "com.docker.compose.service": "worker" },
        Ports: [{ PrivatePort: 8000 }],
      },
      {
        Id: "c-beat",
        Labels: { "com.docker.compose.service": "beat" },
        Ports: [{ PrivatePort: 8000 }],
      },
    ]);

    await deployProyecto({ ...baseParams, puerto: 8000 });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith({
      Container: "c-web",
      EndpointConfig: { Aliases: ["acme-web-app"] },
    });
  });

  it("si ningún contenedor declara el puerto, cae al comportamiento anterior (todos)", async () => {
    mockListContainers.mockResolvedValue([
      { Id: "c-db", Names: ["/db"], Ports: [{ PrivatePort: 5432 }] },
      { Id: "c-worker", Names: ["/worker"], Ports: [] },
    ]);

    await deployProyecto({ ...baseParams, puerto: 8000 });

    expect(mockConnect).toHaveBeenCalledTimes(2);
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

describe("deployProyecto — composeContent (compose editor)", () => {
  const composeYaml = `services:\n  web:\n    image: nginx:alpine\n  api:\n    build: .\n`;

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

  it("escribe composeContent en panelDir como fichero compose", async () => {
    await deployProyecto({ ...baseParams, composeContent: composeYaml });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/.panel/web-app.docker-compose.yml",
      composeYaml,
      { encoding: "utf-8" },
    );
  });

  it("usa el fichero de panelDir (no repoDir) como -f en docker compose", async () => {
    await deployProyecto({ ...baseParams, composeContent: composeYaml });

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const fIdx = spawnArgs.indexOf("-f");
    expect(spawnArgs[fIdx + 1]).toBe(
      "/var/vicalba/repos/acme/.panel/web-app.docker-compose.yml",
    );
  });

  it("escribe env vars en panelDir como .env con --env-file cuando hay composeContent", async () => {
    await deployProyecto({
      ...baseParams,
      composeContent: composeYaml,
      variables: [
        { clave: "DB_URL", valor: "postgres://localhost/db" },
        { clave: "SECRET", valor: "abc123" },
      ],
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/.panel/web-app.env",
      "DB_URL=postgres://localhost/db\nSECRET=abc123",
      { encoding: "utf-8", mode: 0o600 },
    );

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const envFileIdx = spawnArgs.indexOf("--env-file");
    expect(envFileIdx).toBeGreaterThan(-1);
    expect(spawnArgs[envFileIdx + 1]).toBe(
      "/var/vicalba/repos/acme/.panel/web-app.env",
    );
  });

  it("no necesita repoUrl para desplegar cuando hay composeContent", async () => {
    await expect(
      deployProyecto({
        tipo: "compose",
        rama: "main",
        clienteSlug: "acme",
        proyectoNombre: "web-app",
        composeContent: composeYaml,
      }),
    ).resolves.toBeDefined();

    // Sin repoUrl no se llama a git
    const gitCalls = vi
      .mocked(mockExecFile)
      .mock.calls.filter(([cmd]) => cmd === "git");
    expect(gitCalls).toHaveLength(0);
  });

  it("sigue usando repoDir/docker-compose.yml cuando no hay composeContent", async () => {
    await deployProyecto(baseParams);

    const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
    const fIdx = spawnArgs.indexOf("-f");
    expect(spawnArgs[fIdx + 1]).toBe(
      "/var/vicalba/repos/acme/web-app/docker-compose.yml",
    );
  });
});

describe("deployProyecto — variables build-time y GIT_SHA_SHORT", () => {
  const envRepo = "/var/vicalba/repos/acme/web-app/.env";

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue("");
    mockUnlink.mockResolvedValue(undefined);
    mockListContainers.mockResolvedValue([]);
    mockGetNetwork.mockReturnValue({ connect: mockConnect });
    mockSpawn.mockImplementation(() => makeSpawnResult(0));
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => {
        if (args[2] === "rev-parse" && args[3] === "HEAD")
          return cb(null, "e881352abcdef0123456789\n", "");
        cb(null, "", "");
      },
    );
  });

  const writesTo = (path: string) =>
    vi.mocked(mockWriteFile).mock.calls.filter(([p]) => p === path);

  it("compose desde repo: el .env del build incluye runtime, build-time y GIT_SHA_SHORT antes del up", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [{ clave: "DATABASE_URL", valor: "postgres://db" }],
      variablesBuildTime: [{ clave: "VITE_SENTRY_DSN", valor: "https://dsn" }],
    });

    const [primera] = writesTo(envRepo);
    expect(primera?.[1]).toBe(
      "DATABASE_URL=postgres://db\nVITE_SENTRY_DSN=https://dsn\nGIT_SHA_SHORT=e881352",
    );
    const writeOrder =
      vi.mocked(mockWriteFile).mock.invocationCallOrder[
        vi.mocked(mockWriteFile).mock.calls.indexOf(primera!)
      ];
    expect(writeOrder).toBeLessThan(mockSpawn.mock.invocationCallOrder[0]);
  });

  it("compose desde repo: tras el up el .env queda solo con las runtime (los secretos de build no persisten)", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [{ clave: "DATABASE_URL", valor: "postgres://db" }],
      variablesBuildTime: [{ clave: "VITE_SENTRY_DSN", valor: "https://dsn" }],
    });

    const escrituras = writesTo(envRepo);
    expect(escrituras.at(-1)?.[1]).toBe("DATABASE_URL=postgres://db");
    const ultimaOrden =
      vi.mocked(mockWriteFile).mock.invocationCallOrder[
        vi.mocked(mockWriteFile).mock.calls.indexOf(escrituras.at(-1)!)
      ];
    expect(ultimaOrden).toBeGreaterThan(mockSpawn.mock.invocationCallOrder[0]);
  });

  it("compose desde repo: restaura el .env runtime aunque el build falle", async () => {
    mockSpawn.mockImplementationOnce(() => makeSpawnResult(1));

    await expect(
      deployProyecto({
        ...baseParams,
        variables: [{ clave: "DATABASE_URL", valor: "postgres://db" }],
        variablesBuildTime: [
          { clave: "VITE_SENTRY_DSN", valor: "https://dsn" },
        ],
      }),
    ).rejects.toThrow();

    expect(writesTo(envRepo).at(-1)?.[1]).toBe("DATABASE_URL=postgres://db");
  });

  it("compose desde repo: sin runtime vars deja el .env vacío tras el up (env_file: .env debe existir)", async () => {
    await deployProyecto({
      ...baseParams,
      variablesBuildTime: [{ clave: "VITE_SENTRY_DSN", valor: "https://dsn" }],
    });

    expect(writesTo(envRepo).at(-1)?.[1]).toBe("");
    expect(mockUnlink).not.toHaveBeenCalledWith(envRepo);
  });

  it("dockerfile: el compose generado pasa build-time y GIT_SHA_SHORT como build.args", async () => {
    await deployProyecto({
      ...baseParams,
      tipo: "dockerfile",
      variables: [{ clave: "DATABASE_URL", valor: "postgres://db" }],
      variablesBuildTime: [
        { clave: "VITE_SENTRY_DSN", valor: 'https://"dsn"' },
      ],
    });

    const [compose] = writesTo(
      "/var/vicalba/repos/acme/.panel/web-app.docker-compose.yml",
    );
    expect(compose?.[1]).toContain(
      [
        "    build:",
        '      context: "/var/vicalba/repos/acme/web-app"',
        '      dockerfile: "/var/vicalba/repos/acme/web-app/Dockerfile"',
        "      args:",
        '        VITE_SENTRY_DSN: "https://\\"dsn\\""',
        '        GIT_SHA_SHORT: "e881352"',
      ].join("\n"),
    );
    expect(compose?.[1]).not.toMatch(/args:[\s\S]*DATABASE_URL[\s\S]*ports:/);
  });

  const envLocal = "/var/vicalba/repos/acme/web-app/.env.local";
  const nodejs = {
    ...baseParams,
    tipo: "nodejs",
    puerto: 3000,
    buildCommand: "npm run build",
    startCommand: "npm start",
  };

  it("nodejs: .env.local del build incluye las build-time y GIT_SHA_SHORT", async () => {
    await deployProyecto({
      ...nodejs,
      variablesBuildTime: [{ clave: "VITE_SENTRY_DSN", valor: "https://dsn" }],
    });

    expect(writesTo(envLocal)[0]?.[1]).toBe(
      "VITE_SENTRY_DSN=https://dsn\nGIT_SHA_SHORT=e881352",
    );
  });

  it("nodejs: sin build-time del usuario también recibe GIT_SHA_SHORT y la imagen final no lleva .env.local", async () => {
    await deployProyecto(nodejs);

    expect(writesTo(envLocal)[0]?.[1]).toBe("GIT_SHA_SHORT=e881352");
    const [dockerfile] = writesTo(
      "/var/vicalba/repos/acme/.panel/web-app.Dockerfile",
    );
    expect(dockerfile?.[1]).toContain("rm -f .env.local");
    expect(dockerfile?.[1]).toContain("FROM node:22-alpine AS builder");
    expect(dockerfile?.[1]).toContain("FROM node:22-alpine AS runner");
    // Node 20 is out of support (no security patches) since April 2026.
    expect(dockerfile?.[1]).not.toContain("node:20");
    expect(mockUnlink).toHaveBeenCalledWith(envLocal);
  });

  const ignoreGenerado =
    "/var/vicalba/repos/acme/.panel/web-app.Dockerfile.dockerignore";

  it("nodejs: la imagen no incluye el .git del repositorio", async () => {
    await deployProyecto(nodejs);

    expect(writesTo(ignoreGenerado)[0]?.[1]).toBe(".git\n");
  });

  it("nodejs: respeta el .dockerignore del repositorio y le añade .git", async () => {
    mockReadFile.mockImplementation(async (ruta: string) => {
      if (ruta === "/var/vicalba/repos/acme/web-app/.dockerignore")
        return "dist\n*.log\n";
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    await deployProyecto(nodejs);

    expect(writesTo(ignoreGenerado)[0]?.[1]).toBe("dist\n*.log\n\n.git\n");
  });

  it("compose desde repo no borra un .env.local que no ha creado", async () => {
    await deployProyecto({
      ...baseParams,
      variablesBuildTime: [{ clave: "VITE_SENTRY_DSN", valor: "https://dsn" }],
    });

    expect(mockUnlink).not.toHaveBeenCalledWith(envLocal);
  });

  it("GIT_SHA_SHORT definida por el usuario se sustituye por el commit realmente desplegado", async () => {
    await deployProyecto({
      ...baseParams,
      variablesBuildTime: [{ clave: "GIT_SHA_SHORT", valor: "v0.9.00" }],
    });

    expect(writesTo(envRepo)[0]?.[1]).toBe("GIT_SHA_SHORT=e881352");
  });
});

describe("deployProyecto — cancelación", () => {
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

  it("pasa la señal de cancelación a git y a docker compose", async () => {
    const { signal } = new AbortController();
    await deployProyecto({ ...baseParams, signal });

    const llamadasGit = mockExecFileOpts.mock.calls.filter(
      ([cmd]) => cmd === "git",
    );
    expect(llamadasGit.length).toBeGreaterThan(0);
    for (const [, , opts] of llamadasGit) {
      expect(opts).toMatchObject({ signal });
    }
    expect(mockSpawn).toHaveBeenCalledWith(
      "docker",
      expect.any(Array),
      expect.objectContaining({ signal }),
    );
  });
});
