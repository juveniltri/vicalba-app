"use client";

import { useCallback, useSyncExternalStore } from "react";

const CLAVE = "vicalba:fijados";
const SIN_FIJADOS: string[] = [];

// Per-browser convenience: pins live in localStorage, with an in-memory
// fallback when storage is blocked (private mode, disabled site data).
let memoria: string[] = SIN_FIJADOS;
let ultimoRaw: string | null | undefined;
let ultimo: string[] = SIN_FIJADOS;
const oyentes = new Set<() => void>();

function parsear(raw: string | null): string[] {
  if (!raw) return SIN_FIJADOS;
  try {
    const valor: unknown = JSON.parse(raw);
    return Array.isArray(valor) && valor.every((v) => typeof v === "string")
      ? valor
      : SIN_FIJADOS;
  } catch {
    return SIN_FIJADOS;
  }
}

function leer(): string[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CLAVE);
  } catch {
    return memoria;
  }
  if (raw !== ultimoRaw) {
    ultimoRaw = raw;
    ultimo = parsear(raw);
  }
  return ultimo;
}

function escribir(lista: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    memoria = lista;
  }
  oyentes.forEach((o) => o());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

export function useFijados() {
  const fijados = useSyncExternalStore(suscribir, leer, () => SIN_FIJADOS);

  const alternar = useCallback((id: string) => {
    const actuales = leer();
    escribir(
      actuales.includes(id)
        ? actuales.filter((f) => f !== id)
        : [...actuales, id],
    );
  }, []);

  const estaFijado = useCallback(
    (id: string) => fijados.includes(id),
    [fijados],
  );

  return { fijados, alternar, estaFijado };
}
