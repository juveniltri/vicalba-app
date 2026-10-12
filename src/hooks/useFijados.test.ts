// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFijados } from "./useFijados";

const CLAVE = "vicalba:fijados";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useFijados", () => {
  it("empieza vacío si no hay nada guardado", () => {
    const { result } = renderHook(() => useFijados());
    expect(result.current.fijados).toEqual([]);
  });

  it("carga los proyectos fijados guardados", () => {
    localStorage.setItem(CLAVE, JSON.stringify(["p1", "p2"]));
    const { result } = renderHook(() => useFijados());
    expect(result.current.fijados).toEqual(["p1", "p2"]);
    expect(result.current.estaFijado("p2")).toBe(true);
  });

  it("alternar fija y desfija un proyecto y lo persiste", () => {
    const { result } = renderHook(() => useFijados());

    act(() => result.current.alternar("p1"));
    expect(result.current.fijados).toEqual(["p1"]);
    expect(JSON.parse(localStorage.getItem(CLAVE)!)).toEqual(["p1"]);

    act(() => result.current.alternar("p1"));
    expect(result.current.fijados).toEqual([]);
  });

  it("mantiene sincronizadas varias instancias (sidebar y detalle)", () => {
    const sidebar = renderHook(() => useFijados());
    const detalle = renderHook(() => useFijados());

    act(() => detalle.result.current.alternar("p3"));

    expect(sidebar.result.current.fijados).toEqual(["p3"]);
  });

  it("ignora un valor guardado corrupto", () => {
    localStorage.setItem(CLAVE, "{no es json");
    const { result } = renderHook(() => useFijados());
    expect(result.current.fijados).toEqual([]);
  });

  it("ignora un valor guardado que no es una lista de ids", () => {
    localStorage.setItem(CLAVE, JSON.stringify([1, { x: 1 }]));
    const { result } = renderHook(() => useFijados());
    expect(result.current.fijados).toEqual([]);
  });

  it("sigue funcionando en memoria si localStorage no está disponible", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => useFijados());

    act(() => result.current.alternar("p1"));

    expect(result.current.fijados).toEqual(["p1"]);
  });
});
