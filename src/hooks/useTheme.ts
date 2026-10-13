"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "vicalba-theme";
const oyentes = new Set<() => void>();

function readThemeFromDOM(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function useTheme() {
  // The inline script in layout.tsx sets data-theme before first paint. Reading
  // it through useSyncExternalStore (server snapshot "dark") avoids a hydration
  // mismatch, which made React re-render <html> and reset the theme to dark.
  const theme = useSyncExternalStore(
    suscribir,
    readThemeFromDOM,
    () => "dark" as const,
  );

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Modo privado con storage bloqueado
    }
    oyentes.forEach((o) => o());
  }, []);

  return { theme, setTheme };
}
