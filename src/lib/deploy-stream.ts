import { EventEmitter } from "node:events";

interface DeployEmitter extends EventEmitter {
  on(event: "line", listener: (line: string) => void): this;
  on(event: "done", listener: (resultado: "exito" | "error") => void): this;
  emit(event: "line", line: string): boolean;
  emit(event: "done", resultado: "exito" | "error"): boolean;
}

const emitters = new Map<string, DeployEmitter>();

export function getOrCreateDeployEmitter(proyectoId: string): DeployEmitter {
  if (!emitters.has(proyectoId)) {
    emitters.set(proyectoId, new EventEmitter() as DeployEmitter);
  }
  return emitters.get(proyectoId)!;
}

export function getDeployEmitter(
  proyectoId: string,
): DeployEmitter | undefined {
  return emitters.get(proyectoId);
}

export function clearDeployEmitter(proyectoId: string): void {
  emitters.get(proyectoId)?.removeAllListeners();
  emitters.delete(proyectoId);
}
