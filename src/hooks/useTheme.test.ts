// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "dark";
  vi.restoreAllMocks();
});

import { useTheme } from "./useTheme";

describe("useTheme — inicialización desde DOM", () => {
  it("devuelve 'dark' cuando data-theme es 'dark'", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("devuelve 'light' cuando data-theme es 'light'", () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("usa 'dark' como fallback si data-theme tiene valor desconocido", () => {
    document.documentElement.dataset.theme = "unknown";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});

describe("useTheme — setTheme", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "dark";
  });

  it("actualiza el estado de theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
  });

  it("actualiza document.documentElement.dataset.theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("guarda el nuevo tema en localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));
    expect(localStorage.getItem("vicalba-theme")).toBe("light");
  });

  it("vuelve a dark al llamar setTheme('dark')", () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("vicalba-theme")).toBe("dark");
  });
});
