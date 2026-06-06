import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeployProyecto, mockDeployCreate, mockDeployUpdate } = vi.hoisted(
  () => ({
    mockDeployProyecto: vi.fn(),
    mockDeployCreate: vi.fn(),
    mockDeployUpdate: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock("./deploy", () => ({ deployProyecto: mockDeployProyecto }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deploy: {
      create: mockDeployCreate,
      update: mockDeployUpdate,
    },
  },
}));

import { ejecutarDeploy } from "./deploys";

const baseParams = {
  proyectoId: "p1",
  repoUrl: "https://github.com/org/repo",
  rama: "main",
  clienteSlug: "acme",
  proyectoNombre: "web-app",
  servicios: ["nginx"],
};

describe("ejecutarDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployCreate.mockResolvedValue({ id: "d1" });
    mockDeployUpdate.mockResolvedValue({});
  });

  it("crea registro Deploy con estado en_curso al inicio", async () => {
    mockDeployProyecto.mockResolvedValue("");
    await ejecutarDeploy(baseParams);
    expect(mockDeployCreate).toHaveBeenCalledWith({
      data: { proyectoId: "p1", rama: "main", resultado: "en_curso" },
    });
  });

  it("en éxito actualiza el registro con resultado exito, output y finalizadoEn", async () => {
    mockDeployProyecto.mockResolvedValue("build output");
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          resultado: "exito",
          output: "build output",
          finalizadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it("en éxito retorna { resultado: 'exito', output }", async () => {
    mockDeployProyecto.mockResolvedValue("build output");
    const result = await ejecutarDeploy(baseParams);
    expect(result).toEqual({ resultado: "exito", output: "build output" });
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
    mockDeployProyecto.mockResolvedValue("build output");
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
});
