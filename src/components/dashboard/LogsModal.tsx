"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useContainerLogs } from "@/hooks/useContainerLogs";
import type { LogLine } from "@/hooks/useContainerLogs";

type Nivel = "ALL" | "ERR" | "WARN" | "INFO" | "DEBUG";

type ParsedLine = { level: number | null; ts: string | null; msg: string };

// The logs route asks Docker for timestamps, so every line starts with one.
const MARCA_DOCKER = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})[.\d]*Z ([\s\S]*)$/;

function parseLine(raw: string): ParsedLine {
  const docker = MARCA_DOCKER.exec(raw);
  const tsDocker = docker ? docker[1]! : null;
  const linea = docker ? docker[2]! : raw;
  try {
    const obj = JSON.parse(linea) as {
      level?: unknown;
      time?: unknown;
      msg?: unknown;
    };
    return {
      level: typeof obj.level === "number" ? obj.level : null,
      ts:
        typeof obj.time === "number"
          ? new Date(obj.time).toISOString().substring(11, 19)
          : tsDocker,
      msg: typeof obj.msg === "string" ? obj.msg : linea,
    };
  } catch {
    return { level: null, ts: tsDocker, msg: linea };
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <VisorLogs
        proyectoId={proyectoId}
        titulo={`Logs — ${proyectoNombre}`}
        onClose={onClose}
        className="w-[80vw] h-[80vh]"
      />
    </div>
  );
}

// Mounted only while visible: unmounting closes the log stream.
export function VisorLogs({
  proyectoId,
  titulo,
  onClose,
  className = "",
}: {
  proyectoId: string;
  titulo: string;
  onClose?: () => void;
  className?: string;
}) {
  const { lines, connected, error, sinContenedores, finalizado, clear } =
    useContainerLogs(proyectoId);
  const [nivel, setNivel] = useState<Nivel>("ALL");
  const [mostrarTs, setMostrarTs] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [servicioFiltro, setServicioFiltro] = useState<string>("todos");
  const areaRef = useRef<HTMLDivElement>(null);

  const serviciosDetectados = useMemo(() => {
    const set = new Set(lines.map((l) => l.servicio));
    return Array.from(set).sort();
  }, [lines]);

  // Scrolls the log area only; scrollIntoView would also move the page when
  // the viewer is embedded in a tab.
  useEffect(() => {
    const area = areaRef.current;
    if (autoScroll && area) area.scrollTop = area.scrollHeight;
  }, [lines, autoScroll]);

  const lineasFiltradas = lines
    .filter((e) => pasaFiltro(e, nivel))
    .filter((e) => servicioFiltro === "todos" || e.servicio === servicioFiltro);

  return (
    <div
      className={`bg-surface border border-border rounded-[var(--radius-md)] flex flex-col overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-3 flex-wrap">
        <span className="font-display text-sm font-semibold text-text-primary">
          {titulo}
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
          {/* Selector de servicio — solo si hay múltiples */}
          {serviciosDetectados.length > 1 && (
            <>
              <span className="w-px h-3 bg-border mx-1" />
              <button
                type="button"
                onClick={() => setServicioFiltro("todos")}
                className={`font-mono text-xs px-2 py-0.5 rounded border transition-colors ${
                  servicioFiltro === "todos"
                    ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                    : "border-border text-text-muted hover:border-primary-300"
                }`}
              >
                todos
              </button>
              {serviciosDetectados.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setServicioFiltro(s)}
                  className={`font-mono text-xs px-2 py-0.5 rounded border transition-colors ${
                    servicioFiltro === s
                      ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                      : "border-border text-text-muted hover:border-primary-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </>
          )}

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
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar logs modal"
              className="font-body text-xs text-text-muted hover:text-text-primary ml-2 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Área de logs */}
      <div
        ref={areaRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs text-text-primary space-y-0.5"
      >
        {error && <p className="text-state-error">{error}</p>}
        {sinContenedores ? (
          <p className="text-text-muted">
            El proyecto no tiene contenedores en marcha.
          </p>
        ) : (
          lineasFiltradas.length === 0 &&
          !error &&
          !finalizado && <p className="text-text-muted">Esperando logs…</p>
        )}
        {lineasFiltradas.map((entry, i) => {
          const parsed = parseLine(entry.line);
          return (
            <p
              key={i}
              className="whitespace-pre-wrap break-all leading-relaxed"
            >
              <span className="text-primary-400 mr-2">[{entry.servicio}]</span>
              {mostrarTs && parsed.ts && (
                <span className="text-text-muted mr-2">{parsed.ts}</span>
              )}
              {parsed.msg}
            </p>
          );
        })}
        {finalizado && (
          <p className="pt-2 text-text-muted">
            Los contenedores se han detenido.
          </p>
        )}
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
  );
}
