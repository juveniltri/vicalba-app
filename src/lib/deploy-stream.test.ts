import { describe, expect, it } from "vitest";
import {
  clearDeployEmitter,
  getDeploySnapshot,
  getOrCreateDeployEmitter,
} from "./deploy-stream";

describe("deploy-stream", () => {
  it("getOrCreateDeployEmitter devuelve el mismo emitter para el mismo proyectoId", () => {
    const a = getOrCreateDeployEmitter("p1");
    const b = getOrCreateDeployEmitter("p1");
    expect(a).toBe(b);
    clearDeployEmitter("p1");
  });

  it("getDeploySnapshot de un proyectoId desconocido devuelve undefined", () => {
    expect(getDeploySnapshot("no-existe")).toBeUndefined();
  });

  it("las líneas emitidas antes de suscribirse quedan en el buffer del snapshot", () => {
    const emitter = getOrCreateDeployEmitter("p2");
    emitter.emit("line", "clonando repo…");
    emitter.emit("line", "construyendo imagen…");

    const snapshot = getDeploySnapshot("p2");
    expect(snapshot?.lines).toEqual(["clonando repo…", "construyendo imagen…"]);
    clearDeployEmitter("p2");
  });

  it("done queda registrado en el snapshot para suscriptores tardíos", () => {
    const emitter = getOrCreateDeployEmitter("p3");
    emitter.emit("line", "desplegando…");
    emitter.emit("done", "exito");

    const snapshot = getDeploySnapshot("p3");
    expect(snapshot?.done).toBe("exito");
    expect(snapshot?.lines).toEqual(["desplegando…"]);
    clearDeployEmitter("p3");
  });

  it("un listener externo sigue recibiendo las líneas en vivo tras el registro", () => {
    const emitter = getOrCreateDeployEmitter("p4");
    const received: string[] = [];
    emitter.on("line", (line) => received.push(line));
    emitter.emit("line", "en vivo");

    expect(received).toEqual(["en vivo"]);
    expect(getDeploySnapshot("p4")?.lines).toEqual(["en vivo"]);
    clearDeployEmitter("p4");
  });

  it("clearDeployEmitter borra el snapshot y quita los listeners", () => {
    const emitter = getOrCreateDeployEmitter("p5");
    const received: string[] = [];
    emitter.on("line", (line) => received.push(line));

    clearDeployEmitter("p5");

    expect(getDeploySnapshot("p5")).toBeUndefined();
    emitter.emit("line", "no debería llegar");
    expect(received).toEqual([]);
  });

  it("getOrCreateDeployEmitter tras clear crea un snapshot nuevo sin buffer previo", () => {
    const first = getOrCreateDeployEmitter("p6");
    first.emit("line", "primera tanda");
    clearDeployEmitter("p6");

    const second = getOrCreateDeployEmitter("p6");
    expect(second).not.toBe(first);
    expect(getDeploySnapshot("p6")?.lines).toEqual([]);
    clearDeployEmitter("p6");
  });
});
