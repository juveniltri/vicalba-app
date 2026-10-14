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
    proc.on("error", reject);
    proc.on("close", (codigo) => {
      if (codigo === 0) return resolve(stdout);
      const ultimas = stderr.trim().split("\n").slice(-LINEAS_ERROR).join("\n");
      reject(
        new ErrorProceso(
          `${comando} terminó con código ${codigo}${ultimas ? `:\n${ultimas}` : ""}`,
          codigo,
          stdout,
        ),
      );
    });
  });
}
