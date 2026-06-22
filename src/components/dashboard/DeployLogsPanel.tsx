"use client";

import { useEffect, useRef, useState } from "react";
import { useDeployLogs } from "@/hooks/useDeployLogs";

export function DeployLogsPanel({
  proyectoId,
  active,
}: {
  proyectoId: string;
  active: boolean;
}) {
  const { lines, done } = useDeployLogs(proyectoId, active);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  if (!active && lines.length === 0) return null;

  return (
    <div className="mb-6 bg-surface border border-border rounded-[var(--radius-lg)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-body text-[12.5px] font-medium flex items-center gap-2">
          {done === null && active ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-state-warning animate-pulse shrink-0" />
              <span className="text-state-warning">Desplegando…</span>
            </>
          ) : done === "exito" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-state-running shrink-0" />
              <span className="text-state-running">Deploy completado</span>
            </>
          ) : done === "error" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-state-error shrink-0" />
              <span className="text-state-error">Deploy fallido</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
              <span className="text-text-muted">Deploy logs</span>
            </>
          )}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Reducir deploy logs" : "Expandir deploy logs"}
          className="font-body text-[11px] text-text-muted hover:text-text-primary px-2 py-1 rounded-[var(--radius-sm)] hover:bg-elevated transition-colors"
        >
          {expanded ? "Reducir" : "Expandir"}
        </button>
      </div>
      {/* Terminal */}
      <div
        className={`${expanded ? "h-[60vh]" : "h-56"} overflow-y-auto p-4 font-mono text-[12px] leading-[1.6] text-text-primary space-y-0.5 transition-[height] duration-[var(--duration-fast)] bg-[var(--color-background)]`}
      >
        {lines.length === 0 && (
          <p className="text-text-muted">Esperando output…</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap break-all">
            {line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
