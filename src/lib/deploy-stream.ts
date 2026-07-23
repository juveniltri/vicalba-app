import { EventEmitter } from "node:events";

interface DeployEmitter extends EventEmitter {
  on(event: "line", listener: (line: string) => void): this;
  on(event: "done", listener: (resultado: "exito" | "error") => void): this;
  emit(event: "line", line: string): boolean;
  emit(event: "done", resultado: "exito" | "error"): boolean;
}

interface DeployStreamState {
  emitter: DeployEmitter;
  lines: string[];
  done: "exito" | "error" | null;
}

const streams = new Map<string, DeployStreamState>();

export function getOrCreateDeployEmitter(proyectoId: string): DeployEmitter {
  let state = streams.get(proyectoId);
  if (!state) {
    const emitter = new EventEmitter() as DeployEmitter;
    state = { emitter, lines: [], done: null };
    streams.set(proyectoId, state);
    emitter.on("line", (line) => state!.lines.push(line));
    emitter.on("done", (resultado) => {
      state!.done = resultado;
    });
  }
  return state.emitter;
}

export function getDeploySnapshot(
  proyectoId: string,
): DeployStreamState | undefined {
  return streams.get(proyectoId);
}

export function clearDeployEmitter(proyectoId: string): void {
  streams.get(proyectoId)?.emitter.removeAllListeners();
  streams.delete(proyectoId);
}
