"use client";

import { useCallback, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "vicalba-theme";

function readThemeFromDOM(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme() {
  // El lazy initializer lee del DOM, que el inline script de layout.tsx ya
  // inicializó con el tema correcto antes del primer paint.
  const [theme, setThemeState] = useState<Theme>(readThemeFromDOM);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Modo privado con storage bloqueado
    }
  }, []);

  return { theme, setTheme };
}
