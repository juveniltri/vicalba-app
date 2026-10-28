import { spawn } from "node:child_process";

export type Proceso = {
  comando: string;
  args: string[];
  env?: Record<string, string>;
};

const LINEAS_ERROR = 15;

export class ErrorProceso extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly salida: string,
  ) {
    super(message);
    this.name = "ErrorProceso";
  }
}

function entorno(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "/tmp",
    ...extra,
  };
}

// PATH and HOME come from the panel; everything else the child needs is passed
// explicitly so secrets never leak between commands.
export function ejecutar(
  comando: string,
  args: string[],
  opciones: {
    env?: Record<string, string>;
    cwd?: string;
    signal?: AbortSignal;
    entrada?: string;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, {
      cwd: opciones.cwd,
      signal: opciones.signal,
      env: entorno(opciones.env),
    });
    // A process that exits without reading its stdin must not crash the panel.
    proc.stdin.on("error", () => {});
    proc.stdin.end(opciones.entrada);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    let cancelado = false;
    proc.on("error", (err) => {
      // Aborted: wait for "close" so the error keeps what the process said.
      if (err.name === "AbortError") cancelado = true;
      else reject(err);
    });
    proc.on("close", (codigo) => {
      if (codigo === 0 && !cancelado) return resolve(stdout);
      const ultimas = stderr.trim().split("\n").slice(-LINEAS_ERROR).join("\n");
      const motivo = cancelado ? "cancelado" : `terminó con código ${codigo}`;
      const error = new ErrorProceso(
        `${comando} ${motivo}${ultimas ? `:\n${ultimas}` : ""}`,
        codigo,
        stdout,
      );
      // Keeps motivoDeFallo() recognising a cancellation.
      if (cancelado) error.name = "AbortError";
      reject(error);
    });
  });
}

type Resultado = { codigo: number | null; stderr: string; cancelado: boolean };

function lanzar(
  proceso: Proceso,
  recoger: boolean,
  signal: AbortSignal | undefined,
  alError: (err: Error) => void,
) {
  const proc = spawn(proceso.comando, proceso.args, {
    signal,
    env: entorno(proceso.env),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  if (recoger) proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
  proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
  let cancelado = false;
  proc.on("error", (err) => {
    if (err.name === "AbortError") cancelado = true;
    else alError(err);
  });
  const terminado = new Promise<Resultado>((resolve) => {
    proc.on("close", (codigo) => resolve({ codigo, stderr, cancelado }));
  });
  return { proc, terminado, salida: () => stdout };
}

// Pipes origen's stdout into destino's stdin; fails if either side fails.
export function encadenar(
  origen: Proceso,
  destino: Proceso,
  opciones: { signal?: AbortSignal },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const a = lanzar(origen, false, opciones.signal, reject);
    const b = lanzar(destino, true, opciones.signal, reject);
    a.proc.stdout.pipe(b.proc.stdin);
    // destino may exit before reading everything (EPIPE); its exit code tells.
    b.proc.stdin.on("error", () => {});
    a.proc.stdin.end();
    // Nobody reads origen any more: drain it so it can finish instead of blocking.
    void b.terminado.then(() => a.proc.stdout.resume());
    void Promise.all([a.terminado, b.terminado]).then(([ra, rb]) => {
      const fallo: [Proceso, Resultado, string] | null =
        ra.codigo !== 0 || ra.cancelado
          ? [origen, ra, ""]
          : rb.codigo !== 0 || rb.cancelado
            ? [destino, rb, b.salida()]
            : null;
      if (!fallo) return resolve(b.salida());
      const [proceso, r, salida] = fallo;
      const cancelado = ra.cancelado || rb.cancelado;
      const ultimas = r.stderr
        .trim()
        .split("\n")
        .slice(-LINEAS_ERROR)
        .join("\n");
      const motivo = cancelado ? "cancelado" : `terminó con código ${r.codigo}`;
      const error = new ErrorProceso(
        `${proceso.comando} ${motivo}${ultimas ? `:\n${ultimas}` : ""}`,
        r.codigo,
        salida,
      );
      if (cancelado) error.name = "AbortError";
      reject(error);
    });
  });
}
