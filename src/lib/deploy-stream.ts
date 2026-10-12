import { EventEmitter } from "node:events";

interface DeployEmitter extends EventEmitter {
  on(event: "line", listener: (line: string) => void): this;
  on(event: "done", listener: (resultado: "exito" | "error") => void): this;
  emit(event: "line", line: string): boolean;
  emit(event: "done", resultado: "exito" | "error"): boolean;
}

interface DeployStream {
  emitter: DeployEmitter;
  lineas: string[];
  resultado: "exito" | "error" | null;
}

// NOTE: Next.js bundles each route separately, so a module-level Map would not be
// shared between the deploy trigger (server action / tRPC) and the SSE route.
const globalForDeployStream = globalThis as unknown as {
  deployStreams?: Map<string, DeployStream>;
};
const streams = (globalForDeployStream.deployStreams ??= new Map<
  string,
  DeployStream
>());

export function getOrCreateDeployEmitter(proyectoId: string): DeployEmitter {
  const existente = streams.get(proyectoId);
  if (existente && !existente.resultado) return existente.emitter;
  existente?.emitter.removeAllListeners();

  const stream: DeployStream = {
    emitter: new EventEmitter() as DeployEmitter,
    lineas: [],
    resultado: null,
  };
  stream.emitter.on("line", (line) => stream.lineas.push(line));
  stream.emitter.on("done", (resultado) => (stream.resultado = resultado));
  streams.set(proyectoId, stream);
  return stream.emitter;
}

export function suscribirDeployLogs(
  proyectoId: string,
  onLine: (line: string) => void,
  onDone: (resultado: "exito" | "error") => void,
): (() => void) | null {
  const stream = streams.get(proyectoId);
  if (!stream) return null;

  stream.lineas.forEach((line) => onLine(line));
  if (stream.resultado) {
    onDone(stream.resultado);
    return () => {};
  }
  stream.emitter.on("line", onLine);
  stream.emitter.on("done", onDone);
  return () => {
    stream.emitter.off("line", onLine);
    stream.emitter.off("done", onDone);
  };
}

export function clearDeployEmitter(
  proyectoId: string,
  soloSiEs?: DeployEmitter,
): void {
  const stream = streams.get(proyectoId);
  if (soloSiEs && stream?.emitter !== soloSiEs) return;
  stream?.emitter.removeAllListeners();
  streams.delete(proyectoId);
}
