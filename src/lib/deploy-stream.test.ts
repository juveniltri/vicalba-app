import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDeployEmitter,
  getOrCreateDeployEmitter,
  suscribirDeployLogs,
} from "./deploy-stream";

describe("suscribirDeployLogs", () => {
  afterEach(() => clearDeployEmitter("p1"));

  it("un suscriptor que llega tarde recibe las líneas ya emitidas", () => {
    const emitter = getOrCreateDeployEmitter("p1");
    emitter.emit("line", "→ Clonando repositorio...");
    emitter.emit("line", "→ SHA: abc");

    const onLine = vi.fn();
    suscribirDeployLogs("p1", onLine, vi.fn());

    expect(onLine.mock.calls.map(([l]) => l)).toEqual([
      "→ Clonando repositorio...",
      "→ SHA: abc",
    ]);
  });

  it("si el deploy ya terminó, entrega el resultado tras las líneas", () => {
    const emitter = getOrCreateDeployEmitter("p1");
    emitter.emit("line", "✓ Deploy completado");
    emitter.emit("done", "exito");

    const eventos: string[] = [];
    suscribirDeployLogs(
      "p1",
      (l) => eventos.push(l),
      (r) => eventos.push(`done:${r}`),
    );

    expect(eventos).toEqual(["✓ Deploy completado", "done:exito"]);
  });

  it("los suscriptores en vivo reciben líneas nuevas y dejan de recibirlas al desuscribirse", () => {
    const emitter = getOrCreateDeployEmitter("p1");
    const onLine = vi.fn();
    const desuscribir = suscribirDeployLogs("p1", onLine, vi.fn());

    emitter.emit("line", "a");
    desuscribir?.();
    emitter.emit("line", "b");

    expect(onLine.mock.calls.map(([l]) => l)).toEqual(["a"]);
  });

  it("un deploy nuevo tras uno terminado empieza con el historial vacío", () => {
    const anterior = getOrCreateDeployEmitter("p1");
    anterior.emit("line", "viejo");
    anterior.emit("done", "error");

    const nuevo = getOrCreateDeployEmitter("p1");
    nuevo.emit("line", "nuevo");

    const onLine = vi.fn();
    const onDone = vi.fn();
    suscribirDeployLogs("p1", onLine, onDone);
    expect(onLine.mock.calls.map(([l]) => l)).toEqual(["nuevo"]);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("limpiar el stream de un deploy anterior no afecta al deploy en curso", () => {
    const anterior = getOrCreateDeployEmitter("p1");
    anterior.emit("done", "exito");
    const nuevo = getOrCreateDeployEmitter("p1");
    nuevo.emit("line", "en curso");

    clearDeployEmitter("p1", anterior);

    const onLine = vi.fn();
    suscribirDeployLogs("p1", onLine, vi.fn());
    expect(onLine).toHaveBeenCalledWith("en curso");
  });

  it("devuelve null si no hay deploy en curso para el proyecto", () => {
    expect(suscribirDeployLogs("otro", vi.fn(), vi.fn())).toBeNull();
  });
});
