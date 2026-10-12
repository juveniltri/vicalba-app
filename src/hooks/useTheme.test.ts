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

describe("useTheme — hidratación", () => {
  it("no provoca error de hidratación cuando el script ya puso el tema claro", async () => {
    const { createElement } = await import("react");
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { act } = await import("@testing-library/react");

    function Etiqueta() {
      const { theme } = useTheme();
      return createElement("span", null, theme);
    }

    document.documentElement.dataset.theme = "dark";
    const html = renderToString(createElement(Etiqueta));
    const contenedor = document.createElement("div");
    contenedor.innerHTML = html;
    document.body.appendChild(contenedor);

    // The inline script in layout.tsx runs before hydration
    document.documentElement.dataset.theme = "light";
    const onRecoverableError = vi.fn();
    await act(async () => {
      hydrateRoot(contenedor, createElement(Etiqueta), { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(contenedor.textContent).toBe("light");
    contenedor.remove();
  });
});
