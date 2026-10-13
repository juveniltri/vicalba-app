"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { IconX } from "@/components/ui/icons";

const CLAVE = "vicalba:novedades-vistas";

// Per-browser convenience, like the pinned projects: storage can be blocked
// (private mode), so there is an in-memory fallback.
let memoria: string | null = null;
const oyentes = new Set<() => void>();

function leer(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return memoria;
  }
}

function marcarVista(version: string) {
  try {
    localStorage.setItem(CLAVE, version);
  } catch {
    memoria = version;
  }
  oyentes.forEach((oyente) => oyente());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  window.addEventListener("storage", oyente);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", oyente);
  };
}

export function AvisoNovedades({
  version,
  resumen,
}: {
  version: string;
  resumen: string | null;
}) {
  // The server snapshot counts as "seen": the notice only appears once the
  // browser confirms it is new, so hydration never mismatches.
  const vista = useSyncExternalStore(suscribir, leer, () => version);
  if (vista === version) return null;

  return (
    <aside
      aria-label="Novedades"
      className="flex items-start gap-3 px-5 py-4 rounded-[var(--radius-lg)] bg-surface border border-[var(--color-accent)]"
    >
      <span
        aria-hidden="true"
        className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-accent)]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 font-body text-[13px]">
        <p className="font-display text-sm font-semibold">
          Novedades de la v{version}
        </p>
        {resumen && <p className="text-text-secondary">{resumen}</p>}
        <Link
          href="/novedades"
          onClick={() => marcarVista(version)}
          className="self-start text-accent-text hover:underline"
        >
          Ver novedades →
        </Link>
      </div>
      <button
        type="button"
        onClick={() => marcarVista(version)}
        aria-label="Cerrar aviso de novedades"
        className="p-1 rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
      >
        <IconX className="w-[14px] h-[14px]" />
      </button>
    </aside>
  );
}
