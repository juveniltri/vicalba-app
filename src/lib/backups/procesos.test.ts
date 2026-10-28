import { describe, expect, it } from "vitest";
import { ErrorProceso, ejecutar, encadenar } from "./procesos";

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

  it("al cancelarse conserva lo último que escribió en stderr", async () => {
    const controller = new AbortController();
    const promesa = ejecutar(
      node,
      [
        "-e",
        "console.error('retrying: no such host'); setTimeout(() => {}, 10000)",
      ],
      { signal: controller.signal },
    );
    await new Promise((r) => setTimeout(r, 300));
    controller.abort();
    const err = await promesa.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as Error).name).toBe("AbortError");
    expect((err as Error).message).toContain("retrying: no such host");
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

describe("entrada y encadenado", () => {
  const origen = (js: string) => ({ comando: node, args: ["-e", js] });
  const destino = {
    comando: node,
    args: [
      "-e",
      "process.stdin.on('data', d => process.stdout.write(d.toString().toUpperCase()))",
    ],
  };

  it("ejecutar escribe la entrada en stdin", async () => {
    expect(
      await ejecutar(node, ["-e", "process.stdin.pipe(process.stdout)"], {
        entrada: "hola",
      }),
    ).toBe("hola");
  });

  it("encadenar pasa la salida de uno a la entrada del otro", async () => {
    expect(
      await encadenar(origen("process.stdout.write('hola')"), destino, {}),
    ).toBe("HOLA");
  });

  it("encadenar falla si falla el origen aunque el destino termine bien", async () => {
    const err = await encadenar(origen("process.exit(3)"), destino, {}).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as ErrorProceso).codigo).toBe(3);
  });

  it("encadenar falla si falla el destino", async () => {
    const err = await encadenar(
      origen("process.stdout.write('x')"),
      {
        comando: node,
        args: ["-e", "console.error('roto'); process.exit(4)"],
      },
      {},
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as ErrorProceso).codigo).toBe(4);
    expect((err as Error).message).toContain("roto");
  });

  it("encadenar cancelado mata a los dos", async () => {
    const controller = new AbortController();
    const espera = "setTimeout(() => {}, 10000)";
    const promesa = encadenar(origen(espera), origen(espera), {
      signal: controller.signal,
    });
    await new Promise((r) => setTimeout(r, 300));
    controller.abort();
    const err = await promesa.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as Error).name).toBe("AbortError");
  });

  it("encadenar rechaza si un comando no existe", async () => {
    await expect(
      encadenar(
        { comando: "comando-que-no-existe-xyz", args: [] },
        destino,
        {},
      ),
    ).rejects.toThrow();
  });
});

describe("destino que no lee su entrada", () => {
  const sale = { comando: node, args: ["-e", "process.exit(0)"] };
  const grande = "x".repeat(1024 * 1024);

  it("ejecutar no revienta si el proceso cierra stdin antes de leer", async () => {
    await expect(
      ejecutar(node, ["-e", "process.exit(0)"], { entrada: grande }),
    ).resolves.toBe("");
  });

  it("encadenar no revienta si el destino termina sin leer", async () => {
    await expect(
      encadenar(
        {
          comando: node,
          args: ["-e", "process.stdout.write('x'.repeat(1024*1024))"],
        },
        sale,
        {},
      ),
    ).resolves.toBe("");
  });
});
