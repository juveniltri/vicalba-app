"use client";

import { useEffect, useRef, useState } from "react";
import { useDeployLogs } from "@/hooks/useDeployLogs";
import { shaCorto } from "@/lib/formatHace";

const FASES = ["Repositorio", "Checkout", "Build y arranque", "Red y proxy"];

// Markers are the progress lines deployProyecto emits (src/lib/docker/deploy.ts).
const MARCADORES: Array<{ prefijo: string; fase: number }> = [
  { prefijo: "→ Clonando repositorio", fase: 0 },
  { prefijo: "→ Repositorio ya clonado", fase: 0 },
  { prefijo: "→ Actualizando rama", fase: 1 },
  { prefijo: "→ Haciendo checkout", fase: 1 },
  { prefijo: "→ SHA:", fase: 2 },
  { prefijo: "→ Construyendo e iniciando", fase: 2 },
  { prefijo: "→ Conectando red y proxy", fase: 3 },
  { prefijo: "✓ Deploy completado", fase: FASES.length },
];

function faseActual(lines: string[]): number {
  let fase = 0;
  for (const line of lines) {
    const m = MARCADORES.find((mk) => line.startsWith(mk.prefijo));
    if (m) fase = Math.max(fase, m.fase);
  }
  return fase;
}

function commitDelLog(lines: string[]): string | null {
  const linea = lines.find((l) => l.startsWith("→ SHA:"));
  return linea ? shaCorto(linea.slice("→ SHA:".length).trim()) : null;
}

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
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [lines]);

  if (!active && lines.length === 0) return null;

  const fase = done === "exito" ? FASES.length : faseActual(lines);
  const sha = commitDelLog(lines);
  const titulo =
    done === "exito"
      ? "Deploy completado"
      : done === "error"
        ? "Deploy fallido"
        : done === "cancelado"
          ? "Deploy cancelado"
          : active
            ? "Deploy en curso"
            : "Último deploy";
  const tono =
    done === "exito"
      ? { borde: "border-border", marca: "bg-state-running" }
      : done === "error"
        ? {
            borde: "border-error-border",
            marca: "bg-state-error rounded-[2px]",
          }
        : done === "cancelado"
          ? { borde: "border-border", marca: "bg-text-muted" }
          : {
              borde: "border-deploying-border",
              marca: "bg-state-deploying animate-pulse",
            };

  return (
    <section
      aria-labelledby="deploy-logs-titulo"
      className={`flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface border ${tono.borde}`}
    >
      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5 border-b border-border">
        <span
          className={`size-2 shrink-0 rounded-full ${tono.marca}`}
          aria-hidden="true"
        />
        <h2
          id="deploy-logs-titulo"
          className="font-display text-[15px] font-semibold"
        >
          {titulo}
        </h2>
        {sha && (
          <span className="font-body text-xs text-text-secondary">
            commit <span className="text-accent-text">{sha}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Reducir deploy logs" : "Expandir deploy logs"}
          className="ml-auto min-h-8 px-2.5 rounded-[var(--radius-md)] border border-border-strong font-body text-xs text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors"
        >
          {expanded ? "Reducir" : "Expandir"}
        </button>
      </div>

      <ol
        aria-label="Fases del deploy"
        className="m-0 flex flex-wrap gap-x-[18px] gap-y-1.5 list-none px-[18px] py-3 border-b border-border font-body text-xs"
      >
        {FASES.map((nombre, i) => {
          const hecha = i < fase;
          const enCurso = i === fase && done === null;
          const fallida = i === fase && done === "error";
          const cancelada = i === fase && done === "cancelado";
          const simbolo = hecha
            ? "✓"
            : fallida
              ? "■"
              : cancelada
                ? "⊘"
                : enCurso
                  ? "●"
                  : "○";
          const clase = hecha
            ? "text-running-text"
            : fallida
              ? "text-error-text font-semibold"
              : cancelada
                ? "text-text-secondary font-semibold"
                : enCurso
                  ? "text-deploying-text font-semibold"
                  : "text-text-muted";
          return (
            <li key={nombre} className={clase}>
              {simbolo} {nombre}
            </li>
          );
        })}
      </ol>

      <div
        className={`${expanded ? "h-[65vh]" : "h-[420px]"} overflow-y-auto px-[18px] py-4 bg-terminal font-body text-xs leading-[1.65] text-terminal-text transition-[height] duration-[var(--duration-fast)]`}
      >
        {lines.length === 0 && (
          <p className="text-text-muted">Esperando output…</p>
        )}
        {lines.map((line, i) => (
          <p key={i} className="m-0 whitespace-pre-wrap break-all">
            {line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
