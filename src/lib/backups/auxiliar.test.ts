import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEjecutar } = vi.hoisted(() => ({ mockEjecutar: vi.fn() }));
vi.mock("./procesos", async (original) => ({
  ...(await original<typeof import("./procesos")>()),
  ejecutar: mockEjecutar,
}));

import { hashClave } from "./comandos";
import { ErrorProceso } from "./procesos";
import {
  eliminarAuxiliar,
  IMAGEN_AUXILIAR,
  limpiarAuxiliaresHuerfanos,
  nombreAuxiliar,
} from "./auxiliar";

beforeEach(() => {
  mockEjecutar.mockReset();
});

describe("auxiliar", () => {
  it("fija la imagen y el nombre", () => {
    expect(IMAGEN_AUXILIAR).toBe("busybox:1.37.0");
    expect(nombreAuxiliar("b1", "datos:./x")).toBe(
      `vicalba-backup-b1-${hashClave("datos:./x")}`,
    );
  });

  it("elimina con docker rm -f", async () => {
    mockEjecutar.mockResolvedValue("");
    await eliminarAuxiliar("vicalba-backup-x");
    expect(mockEjecutar).toHaveBeenCalledWith(
      "docker",
      ["rm", "-f", "vicalba-backup-x"],
      {},
    );
  });

  it("ignora «No such container»", async () => {
    mockEjecutar.mockImplementation(async () => {
      throw new ErrorProceso("falló", 1, "Error: No such container: x");
    });
    await expect(eliminarAuxiliar("x")).resolves.toBeUndefined();
  });

  it("propaga otros errores", async () => {
    mockEjecutar.mockImplementation(async () => {
      throw new ErrorProceso("falló", 1, "daemon off");
    });
    await expect(eliminarAuxiliar("x")).rejects.toThrow("falló");
    mockEjecutar.mockImplementation(async () => {
      throw new Error("spawn");
    });
    await expect(eliminarAuxiliar("x")).rejects.toThrow("spawn");
  });

  it("limpia los huérfanos por id", async () => {
    mockEjecutar.mockResolvedValueOnce("id1\nid2\n").mockResolvedValueOnce("");
    expect(await limpiarAuxiliaresHuerfanos()).toBe(2);
    expect(mockEjecutar).toHaveBeenNthCalledWith(
      1,
      "docker",
      ["ps", "-a", "--filter", "name=vicalba-backup-", "-q"],
      {},
    );
    expect(mockEjecutar).toHaveBeenNthCalledWith(
      2,
      "docker",
      ["rm", "-f", "id1", "id2"],
      {},
    );
  });

  it("sin huérfanos no llama a rm", async () => {
    mockEjecutar.mockResolvedValue("\n");
    expect(await limpiarAuxiliaresHuerfanos()).toBe(0);
    expect(mockEjecutar).toHaveBeenCalledTimes(1);
  });
});
