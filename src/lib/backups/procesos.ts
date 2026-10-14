import { spawn } from "node:child_process";

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

// PATH and HOME come from the panel; everything else the child needs is passed
// explicitly so secrets never leak between commands.
export function ejecutar(
  comando: string,
  args: string[],
  opciones: {
    env?: Record<string, string>;
    cwd?: string;
    signal?: AbortSignal;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, {
      cwd: opciones.cwd,
      signal: opciones.signal,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "/tmp",
        ...opciones.env,
      },
    });
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
