"use client";

import { useEffect, useRef } from "react";
import type { LogLine } from "@/hooks/useContainerLogs";

export function LogsPanel({
  lines,
  connected,
  error,
  onClose,
}: {
  lines: LogLine[];
  connected: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="mt-2 bg-background border border-border rounded-[var(--radius-sm)] flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="font-body text-xs text-text-muted">
          {connected ? (
            <span className="text-state-success">● Live</span>
          ) : (
            <span className="text-text-muted">○ Disconnected</span>
          )}
        </span>
        <button
          onClick={onClose}
          aria-label="Cerrar logs"
          className="font-body text-xs text-text-muted hover:text-text-primary"
        >
          ✕
        </button>
      </div>
      <div className="h-40 overflow-y-auto p-2 font-mono text-xs text-text-primary space-y-0.5">
        {error && <p className="text-state-error">{error}</p>}
        {lines.length === 0 && !error && (
          <p className="text-text-muted">Esperando logs…</p>
        )}
        {lines.map((entry, i) => (
          <p key={i} className="whitespace-pre-wrap break-all leading-relaxed">
            <span className="text-primary-400 mr-2">[{entry.servicio}]</span>
            {entry.line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
