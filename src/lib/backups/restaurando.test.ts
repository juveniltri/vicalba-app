import { beforeEach, describe, expect, it } from "vitest";
import {
  desmarcarRestaurando,
  estaRestaurando,
  marcarRestaurando,
  ProyectoRestaurando,
} from "./restaurando";

describe("restaurando", () => {
  beforeEach(() => {
    desmarcarRestaurando("p1");
    desmarcarRestaurando("p2");
  });

  it("marca y desmarca un Proyecto", () => {
    expect(estaRestaurando("p1")).toBe(false);
    marcarRestaurando("p1");
    expect(estaRestaurando("p1")).toBe(true);
    expect(estaRestaurando("p2")).toBe(false);
    desmarcarRestaurando("p1");
    expect(estaRestaurando("p1")).toBe(false);
  });

  it("lanza ProyectoRestaurando si ya está marcado", () => {
    marcarRestaurando("p1");
    expect(() => marcarRestaurando("p1")).toThrow(ProyectoRestaurando);
    expect(() => marcarRestaurando("p1")).toThrow(
      "El Proyecto se está restaurando: espera a que termine",
    );
  });
});
