import { describe, expect, it } from "vitest";
import { ErrorProceso, ejecutar } from "./procesos";

const node = process.execPath;

describe("ejecutar", () => {
  it("devuelve stdout y pasa el entorno indicado", async () => {
    const salida = await ejecutar(
      node,
      ["-e", "process.stdout.write(process.env.PRUEBA ?? '')"],
      {
        env: { PRUEBA: "hola" },
      },
    );
    expect(salida).toBe("hola");
  });

  it("rechaza con el código y las últimas líneas de stderr", async () => {
    const err = await ejecutar(
      node,
      ["-e", "console.error('linea 1\\nfatal: algo falló'); process.exit(3)"],
      {},
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as ErrorProceso).codigo).toBe(3);
    expect((err as ErrorProceso).message).toContain("fatal: algo falló");
  });

  it("se cancela con la señal", async () => {
    const controller = new AbortController();
    const promesa = ejecutar(node, ["-e", "setTimeout(() => {}, 10000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promesa).rejects.toThrow();
  });

  it("hereda PATH y HOME del Panel, con valores por defecto si faltan", async () => {
    const leer = [
      "-e",
      "process.stdout.write(JSON.stringify([process.env.PATH, process.env.HOME]))",
    ];
    const { PATH, HOME } = process.env;
    try {
      process.env.HOME = "/home/panel";
      expect(JSON.parse(await ejecutar(node, leer, {}))).toEqual([
        PATH,
        "/home/panel",
      ]);
      delete process.env.PATH;
      delete process.env.HOME;
      expect(JSON.parse(await ejecutar(node, leer, {}))).toEqual(["", "/tmp"]);
    } finally {
      process.env.PATH = PATH;
      if (HOME === undefined) delete process.env.HOME;
      else process.env.HOME = HOME;
    }
  });

  it("rechaza si el comando no existe", async () => {
    await expect(
      ejecutar("comando-que-no-existe-xyz", [], {}),
    ).rejects.toThrow();
  });
});
