import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeployProyecto,
  mockDeployCreate,
  mockDeployUpdate,
  mockDeployUpdateMany,
  mockProyectoFindMany,
  mockProyectoUpdate,
  mockEstadoContenedores,
} = vi.hoisted(() => ({
  mockDeployProyecto: vi.fn(),
  mockDeployCreate: vi.fn(),
  mockDeployUpdate: vi.fn().mockResolvedValue({}),
  mockDeployUpdateMany: vi.fn().mockResolvedValue({ count: 0 }),
  mockProyectoFindMany: vi.fn().mockResolvedValue([]),
  mockProyectoUpdate: vi.fn().mockResolvedValue({}),
  mockEstadoContenedores: vi.fn().mockResolvedValue("running"),
}));

vi.mock("./deploy", () => ({ deployProyecto: mockDeployProyecto }));
vi.mock("./proyectos", () => ({ estadoContenedores: mockEstadoContenedores }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deploy: {
      create: mockDeployCreate,
      update: mockDeployUpdate,
      updateMany: mockDeployUpdateMany,
    },
    proyecto: { findMany: mockProyectoFindMany, update: mockProyectoUpdate },
  },
}));

import { suscribirDeployLogs } from "@/lib/deploy-stream";
import {
  cancelarDeploy,
  ejecutarDeploy,
  limpiarDeploysHuerfanos,
} from "./deploys";

const baseParams = {
  proyectoId: "p1",
  repoUrl: "https://github.com/org/repo",
  rama: "main",
  clienteSlug: "acme",
  proyectoNombre: "web-app",
};

describe("ejecutarDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployCreate.mockResolvedValue({ id: "d1" });
    mockDeployUpdate.mockResolvedValue({});
  });

  it("crea registro Deploy con estado en_curso al inicio", async () => {
    mockDeployProyecto.mockResolvedValue({ output: "", sha: "sha1" });
    await ejecutarDeploy(baseParams);
    expect(mockDeployCreate).toHaveBeenCalledWith({
      data: {
        proyectoId: "p1",
        rama: "main",
        resultado: "en_curso",
        origen: "manual",
      },
    });
  });

  it("registra el origen del deploy y no lo pasa al proceso de deploy", async () => {
    mockDeployProyecto.mockResolvedValue({ output: "", sha: "sha1" });
    await ejecutarDeploy({ ...baseParams, origen: "webhook" });
    expect(mockDeployCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ origen: "webhook" }),
    });
    expect(mockDeployProyecto.mock.calls[0][0]).not.toHaveProperty("origen");
  });

  it("en éxito actualiza el registro con resultado exito, output, sha y finalizadoEn", async () => {
    mockDeployProyecto.mockResolvedValue({
      output: "build output",
      sha: "abc123",
    });
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          resultado: "exito",
          output: "build output",
          sha: "abc123",
          finalizadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it("en éxito retorna { resultado: 'exito', output }", async () => {
    mockDeployProyecto.mockResolvedValue({
      output: "build output",
      sha: "abc123",
    });
    const result = await ejecutarDeploy(baseParams);
    expect(result).toEqual({ resultado: "exito", output: "build output" });
  });

  it("sha recibido en params se pasa a deployProyecto", async () => {
    mockDeployProyecto.mockResolvedValue({ output: "", sha: "deadbeef" });
    await ejecutarDeploy({ ...baseParams, sha: "deadbeef" });
    expect(mockDeployProyecto).toHaveBeenCalledWith(
      expect.objectContaining({ sha: "deadbeef" }),
    );
  });

  it("sha retornado por deployProyecto se guarda en el registro Deploy", async () => {
    mockDeployProyecto.mockResolvedValue({ output: "ok", sha: "cafebabe" });
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sha: "cafebabe" }),
      }),
    );
  });

  it("en error actualiza el registro con resultado error y stdout+stderr del error", async () => {
    const err = Object.assign(new Error("build failed"), {
      stdout: "partial output",
      stderr: "error log",
    });
    mockDeployProyecto.mockRejectedValue(err);
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          resultado: "error",
          output: "partial output\nerror log",
          finalizadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it("en error retorna { resultado: 'error', output }", async () => {
    const err = Object.assign(new Error("build failed"), {
      stdout: "partial",
      stderr: "err",
    });
    mockDeployProyecto.mockRejectedValue(err);
    const result = await ejecutarDeploy(baseParams);
    expect(result).toEqual({ resultado: "error", output: "partial\nerr" });
  });

  it("en error usa el mensaje del error cuando no hay stdout/stderr", async () => {
    mockDeployProyecto.mockRejectedValue(new Error("network timeout"));
    const result = await ejecutarDeploy(baseParams);
    expect(result.resultado).toBe("error");
    expect(result.output).toBe("network timeout");
  });

  it("nunca lanza aunque deployProyecto falle", async () => {
    mockDeployProyecto.mockRejectedValue(new Error("fatal"));
    await expect(ejecutarDeploy(baseParams)).resolves.not.toThrow();
  });

  it("en error usa String(err) cuando el valor lanzado no es una instancia de Error", async () => {
    mockDeployProyecto.mockRejectedValue("plain string error");
    const result = await ejecutarDeploy(baseParams);
    expect(result.resultado).toBe("error");
    expect(result.output).toBe("plain string error");
  });

  it("retorna exito aunque prisma.deploy.update falle en éxito", async () => {
    mockDeployProyecto.mockResolvedValue({
      output: "build output",
      sha: "sha1",
    });
    mockDeployUpdate.mockRejectedValue(new Error("DB down"));
    const result = await ejecutarDeploy(baseParams);
    expect(result.resultado).toBe("exito");
  });

  it("retorna error aunque prisma.deploy.update falle en error", async () => {
    mockDeployProyecto.mockRejectedValue(new Error("build failed"));
    mockDeployUpdate.mockRejectedValue(new Error("DB down"));
    const result = await ejecutarDeploy(baseParams);
    expect(result.resultado).toBe("error");
  });

  it("no incluye servicios en los params pasados a deployProyecto", async () => {
    mockDeployProyecto.mockResolvedValue({ output: "", sha: "sha1" });
    await ejecutarDeploy(baseParams);
    const call = mockDeployProyecto.mock.calls[0][0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("servicios");
  });
});

// Like the real deployProyecto: killing git/docker compose makes it reject.
function deployHastaAbortar() {
  mockDeployProyecto.mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () =>
          reject(new Error("The operation was aborted")),
        );
      }),
  );
}

describe("cancelarDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployCreate.mockResolvedValue({ id: "d1" });
    mockDeployUpdate.mockResolvedValue({});
  });

  it("cancela el deploy en curso y lo registra como cancelado con el motivo", async () => {
    deployHastaAbortar();
    const deploy = ejecutarDeploy(baseParams);
    await vi.waitFor(() => expect(mockDeployProyecto).toHaveBeenCalled());

    expect(cancelarDeploy("p1", "Cancelado por admin@vicalba.local")).toBe(
      true,
    );

    expect(await deploy).toEqual({
      resultado: "cancelado",
      output: "Cancelado por admin@vicalba.local",
      porTimeout: false,
    });
    expect(mockDeployUpdate).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        resultado: "cancelado",
        output: "Cancelado por admin@vicalba.local",
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("emite el motivo de la cancelación en el log en vivo", async () => {
    deployHastaAbortar();
    const deploy = ejecutarDeploy(baseParams);
    await vi.waitFor(() => expect(mockDeployProyecto).toHaveBeenCalled());
    const lineas: string[] = [];
    let fin: string | null = null;
    suscribirDeployLogs(
      "p1",
      (l) => lineas.push(l),
      (r) => (fin = r),
    );

    cancelarDeploy("p1", "Cancelado por admin@vicalba.local");
    await deploy;

    expect(lineas.at(-1)).toBe("⊘ Cancelado por admin@vicalba.local");
    expect(fin).toBe("cancelado");
  });

  it("devuelve false si el proyecto no tiene un deploy en curso", async () => {
    expect(cancelarDeploy("p1", "x")).toBe(false);

    mockDeployProyecto.mockResolvedValue({ output: "", sha: "sha1" });
    await ejecutarDeploy(baseParams);
    expect(cancelarDeploy("p1", "x")).toBe(false);
  });

  it("se cancela solo al superar timeoutMinutos y lo marca como timeout", async () => {
    vi.useFakeTimers();
    try {
      deployHastaAbortar();
      const deploy = ejecutarDeploy({ ...baseParams, timeoutMinutos: 30 });

      await vi.advanceTimersByTimeAsync(29 * 60_000);
      expect(mockDeployUpdate).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(await deploy).toEqual({
        resultado: "cancelado",
        output: "Cancelado por timeout (30 min)",
        porTimeout: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("con timeoutMinutos 0 no se cancela solo", async () => {
    vi.useFakeTimers();
    try {
      deployHastaAbortar();
      void ejecutarDeploy({ ...baseParams, timeoutMinutos: 0 });
      await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
      expect(mockDeployUpdate).not.toHaveBeenCalled();
      expect(cancelarDeploy("p1", "fin del test")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("limpiarDeploysHuerfanos", () => {
  const MOTIVO = "Interrumpido por reinicio del panel";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployCreate.mockResolvedValue({ id: "d1" });
    mockProyectoFindMany.mockResolvedValue([]);
    mockEstadoContenedores.mockResolvedValue("running");
  });

  it("marca como cancelados los deploys en curso sin proceso vivo", async () => {
    await limpiarDeploysHuerfanos(MOTIVO);

    expect(mockDeployUpdateMany).toHaveBeenCalledWith({
      where: { resultado: "en_curso", proyectoId: { notIn: [] } },
      data: {
        resultado: "cancelado",
        output: MOTIVO,
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("devuelve los proyectos bloqueados en deploying al estado real de sus contenedores", async () => {
    mockProyectoFindMany.mockResolvedValue([
      { id: "p1", nombre: "web", cliente: { slug: "acme" } },
      { id: "p2", nombre: "api", cliente: { slug: "acme" } },
    ]);
    mockEstadoContenedores
      .mockResolvedValueOnce("running")
      .mockRejectedValueOnce(new Error("Docker no responde"));

    expect(await limpiarDeploysHuerfanos(MOTIVO)).toBe(2);

    expect(mockProyectoFindMany).toHaveBeenCalledWith({
      where: { estado: "deploying", id: { notIn: [] } },
      include: { cliente: true },
    });
    expect(mockProyectoUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { estado: "running" },
    });
    expect(mockProyectoUpdate).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: { estado: "error" },
    });
  });

  it("no toca los deploys que siguen en ejecución", async () => {
    deployHastaAbortar();
    void ejecutarDeploy(baseParams);
    await vi.waitFor(() => expect(mockDeployProyecto).toHaveBeenCalled());

    await limpiarDeploysHuerfanos(MOTIVO);

    expect(mockDeployUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { resultado: "en_curso", proyectoId: { notIn: ["p1"] } },
      }),
    );
    cancelarDeploy("p1", "fin del test");
  });

  it("puede limitarse a un único proyecto", async () => {
    await limpiarDeploysHuerfanos(MOTIVO, "p9");

    expect(mockDeployUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resultado: "en_curso",
          proyectoId: { notIn: [], equals: "p9" },
        },
      }),
    );
    expect(mockProyectoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: "deploying", id: { notIn: [], equals: "p9" } },
      }),
    );
  });
});
