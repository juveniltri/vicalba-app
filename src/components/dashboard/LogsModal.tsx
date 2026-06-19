"use client";

import { useEffect, useRef, useState } from "react";
import { useContainerLogs } from "@/hooks/useContainerLogs";
import type { LogLine } from "@/hooks/useContainerLogs";

type Nivel = "ALL" | "ERR" | "WARN" | "INFO" | "DEBUG";

type ParsedLine = { level: number | null; ts: string | null; msg: string };

function parseLine(raw: string): ParsedLine {
  try {
    const obj = JSON.parse(raw) as {
      level?: unknown;
      time?: unknown;
      msg?: unknown;
    };
    return {
      level: typeof obj.level === "number" ? obj.level : null,
      ts:
        typeof obj.time === "number"
          ? new Date(obj.time).toISOString().substring(11, 19)
          : null,
      msg: typeof obj.msg === "string" ? obj.msg : raw,
    };
  } catch {
    return { level: null, ts: null, msg: raw };
  }
}

function nivelMinimo(nivel: Nivel): number | null {
  if (nivel === "ALL") return null;
  if (nivel === "ERR") return 50;
  if (nivel === "WARN") return 40;
  if (nivel === "INFO") return 30;
  return 20; // DEBUG
}

function pasaFiltro(entry: LogLine, nivel: Nivel): boolean {
  const min = nivelMinimo(nivel);
  if (min === null) return true;
  const { level } = parseLine(entry.line);
  if (level === null) return true; // líneas no-JSON siempre visibles
  return level >= min;
}

const NIVELES: Nivel[] = ["ALL", "ERR", "WARN", "INFO", "DEBUG"];

export function LogsModal({
  proyectoId,
  proyectoNombre,
  open,
  onClose,
}: {
  proyectoId: string;
  proyectoNombre: string;
  open: boolean;
  onClose: () => void;
}) {
  const { lines, connected, error, clear } = useContainerLogs(
    open ? proyectoId : null,
  );
  const [nivel, setNivel] = useState<Nivel>("ALL");
  const [mostrarTs, setMostrarTs] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, autoScroll]);

  if (!open) return null;

  const lineasFiltradas = lines.filter((e) => pasaFiltro(e, nivel));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[80vw] h-[80vh] bg-surface border border-border rounded-[var(--radius-md)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-3 flex-wrap">
          <span className="font-display text-sm font-semibold text-text-primary">
            Logs — {proyectoNombre}
            {connected && (
              <span className="ml-2 font-body text-xs text-state-success">
                ● Live
              </span>
            )}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {NIVELES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNivel(n)}
                aria-label={`Filtro ${n}`}
                aria-pressed={nivel === n}
                className={`font-mono text-xs px-2 py-0.5 rounded border transition-colors ${
                  nivel === n
                    ? "border-primary-400 text-primary-400"
                    : "border-border text-text-muted hover:border-primary-300"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMostrarTs((v) => !v)}
              aria-label="Toggle timestamps"
              aria-pressed={mostrarTs}
              className={`font-mono text-xs px-2 py-0.5 rounded border ml-1 transition-colors ${
                mostrarTs
                  ? "border-primary-400 text-primary-400"
                  : "border-border text-text-muted hover:border-primary-300"
              }`}
            >
              TS
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar logs modal"
              className="font-body text-xs text-text-muted hover:text-text-primary ml-2 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Área de logs */}
        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-text-primary space-y-0.5">
          {error && <p className="text-state-error">{error}</p>}
          {lineasFiltradas.length === 0 && !error && (
            <p className="text-text-muted">Esperando logs…</p>
          )}
          {lineasFiltradas.map((entry, i) => {
            const parsed = parseLine(entry.line);
            return (
              <p
                key={i}
                className="whitespace-pre-wrap break-all leading-relaxed"
              >
                <span className="text-primary-400 mr-2">
                  [{entry.servicio}]
                </span>
                {mostrarTs && parsed.ts && (
                  <span className="text-text-muted mr-2">{parsed.ts}</span>
                )}
                {parsed.msg}
              </p>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border">
          <label className="flex items-center gap-2 font-body text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              aria-label="Auto-scroll"
            />
            Auto-scroll
          </label>
          <button
            type="button"
            onClick={clear}
            aria-label="Limpiar buffer"
            className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors"
          >
            Limpiar buffer
          </button>
        </div>
      </div>
    </div>
  );
}
