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
    <div className="mt-2 bg-background border border-border rounded-[var(--radius-sm)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="font-body text-xs">
          {done === null && active ? (
            <span className="text-state-warning animate-pulse">
              ● Desplegando…
            </span>
          ) : done === "exito" ? (
            <span className="text-state-success">✓ Deploy completado</span>
          ) : done === "error" ? (
            <span className="text-state-error">✗ Deploy fallido</span>
          ) : (
            <span className="text-text-muted">Deploy logs</span>
          )}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Reducir deploy logs" : "Expandir deploy logs"}
          className="font-body text-xs text-text-muted hover:text-text-primary"
        >
          {expanded ? "⊟" : "⊞"}
        </button>
      </div>
      <div
        className={`${expanded ? "h-[60vh]" : "h-64"} overflow-y-auto p-3 font-mono text-xs text-text-primary space-y-0.5 transition-[height] duration-[var(--duration-fast)]`}
      >
        {lines.length === 0 && (
          <p className="text-text-muted">Esperando output…</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap break-all leading-relaxed">
            {line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
