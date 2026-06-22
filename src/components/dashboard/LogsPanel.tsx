"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LogLine } from "@/hooks/useContainerLogs";
import { LogsModal } from "./LogsModal";

export function LogsPanel({
  lines,
  connected,
  error,
  onClose,
  proyectoId,
  proyectoNombre,
}: {
  lines: LogLine[];
  connected: boolean;
  error: string | null;
  onClose: () => void;
  proyectoId: string;
  proyectoNombre: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [servicioFiltro, setServicioFiltro] = useState<string>("todos");

  const serviciosDetectados = useMemo(() => {
    const set = new Set(lines.map((l) => l.servicio));
    return Array.from(set).sort();
  }, [lines]);

  const linesFiltradas = useMemo(
    () =>
      servicioFiltro === "todos"
        ? lines
        : lines.filter((l) => l.servicio === servicioFiltro),
    [lines, servicioFiltro],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [linesFiltradas]);

  return (
    <>
      <div className="mt-2 bg-background border border-border rounded-[var(--radius-sm)] flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-body text-xs text-text-muted">
              {connected ? (
                <span className="text-state-success">● Live</span>
              ) : (
                <span className="text-text-muted">○ Disconnected</span>
              )}
            </span>

            {/* Selector de servicio — aparece solo cuando hay más de uno */}
            {serviciosDetectados.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setServicioFiltro("todos")}
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    servicioFiltro === "todos"
                      ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-border text-text-muted hover:text-text-primary"
                  }`}
                >
                  todos
                </button>
                {serviciosDetectados.map((s) => (
                  <button
                    key={s}
                    onClick={() => setServicioFiltro(s)}
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      servicioFiltro === s
                        ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                        : "border-border text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalOpen(true)}
              aria-label="Expandir logs"
              className="font-body text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              ⤢
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar logs"
              className="font-body text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="h-64 overflow-y-auto p-3 font-mono text-xs text-text-primary space-y-0.5">
          {error && <p className="text-state-error">{error}</p>}
          {linesFiltradas.length === 0 && !error && (
            <p className="text-text-muted">Esperando logs…</p>
          )}
          {linesFiltradas.map((entry, i) => (
            <p
              key={i}
              className="whitespace-pre-wrap break-all leading-relaxed"
            >
              <span className="text-primary-400 mr-2">[{entry.servicio}]</span>
              {entry.line}
            </p>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <LogsModal
        proyectoId={proyectoId}
        proyectoNombre={proyectoNombre}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
