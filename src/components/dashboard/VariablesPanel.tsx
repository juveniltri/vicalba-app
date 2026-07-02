"use client";

import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cargarVariablesAction,
  eliminarVariableAction,
  sincronizarVariablesAction,
  toggleBuildTimeAction,
} from "@/app/(panel)/actions";

loader.config({ paths: { vs: "/monaco-editor/vs" } });

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-muted text-sm font-mono">
      Cargando editor…
    </div>
  ),
});

type VariableResumen = {
  id: string;
  clave: string;
  enBuildTime: boolean;
  creadoEn: Date;
};

export function VariablesPanel({
  proyectoId,
  variablesIniciales,
}: {
  proyectoId: string;
  variablesIniciales: VariableResumen[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "editor">("list");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [invalidas, setInvalidas] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoading, startLoadTransition] = useTransition();

  function handleAbrirEditor() {
    setError(null);
    startLoadTransition(async () => {
      const result = await cargarVariablesAction(proyectoId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setContent(result.contenido);
      setMode("editor");
    });
  }

  function handleGuardar() {
    setError(null);
    setInvalidas([]);
    startTransition(async () => {
      const result = await sincronizarVariablesAction(proyectoId, content);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (result.invalidas.length > 0) setInvalidas(result.invalidas);
      setSaved(true);
      setMode("list");
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    });
  }

  function handleCancelar() {
    setMode("list");
    setContent("");
    setError(null);
    setInvalidas([]);
  }

  async function handleToggle(id: string, current: boolean) {
    startLoadTransition(async () => {
      await toggleBuildTimeAction(id, !current);
      router.refresh();
    });
  }

  async function handleEliminar(id: string) {
    startLoadTransition(async () => {
      await eliminarVariableAction(id);
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  if (mode === "editor") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted font-mono">
            Formato .env — una variable por línea. Al guardar se sincronizan:
            las claves eliminadas se borran.
          </p>
          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs text-red-400 font-mono">{error}</span>
            )}
            <button
              onClick={handleCancelar}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-elevated border border-border text-text-primary hover:bg-surface transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {isPending ? "Guardando…" : "Guardar variables"}
            </button>
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border overflow-hidden bg-[#1e1e1e]">
          <MonacoEditor
            height="360px"
            language="ini"
            value={content}
            onChange={(val) => setContent(val ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
              lineNumbers: "on",
              wordWrap: "off",
              scrollBeyondLastLine: false,
              tabSize: 2,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>

        {invalidas.length > 0 && (
          <p className="text-xs text-red-400 font-mono">
            Claves ignoradas (formato inválido): {invalidas.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-xs text-red-400 font-mono">
          {error}
        </p>
      )}

      {variablesIniciales.length === 0 ? (
        <p className="font-body text-xs text-text-muted">
          Sin variables configuradas.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border border border-border rounded-[var(--radius-md)] overflow-hidden">
          {variablesIniciales.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface/50 transition-colors"
            >
              <span className="font-mono text-xs text-text-primary flex-1 truncate">
                {v.clave}=<span className="text-text-muted">••••••••</span>
              </span>

              <label
                className="flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Build time"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={v.enBuildTime}
                  aria-label={`Build time ${v.enBuildTime ? "activado" : "desactivado"}`}
                  disabled={isLoading}
                  onClick={() => handleToggle(v.id, v.enBuildTime)}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors disabled:opacity-40 ${
                    v.enBuildTime ? "bg-primary-500" : "bg-border"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      v.enBuildTime ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="font-body text-xs text-text-muted">build</span>
              </label>

              {confirmDeleteId === v.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-body text-xs text-red-400">
                    ¿Eliminar?
                  </span>
                  <SmallBtn
                    onClick={() => handleEliminar(v.id)}
                    disabled={isLoading}
                  >
                    Sí
                  </SmallBtn>
                  <SmallBtn onClick={() => setConfirmDeleteId(null)}>
                    No
                  </SmallBtn>
                </div>
              ) : (
                <SmallBtn
                  onClick={() => setConfirmDeleteId(v.id)}
                  disabled={isLoading}
                  className="shrink-0"
                >
                  ×
                </SmallBtn>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {saved && (
          <span className="text-xs text-green-400 font-mono">✓ Guardado</span>
        )}
        {invalidas.length > 0 && (
          <span className="text-xs text-red-400 font-mono">
            Ignoradas: {invalidas.join(", ")}
          </span>
        )}
        <button
          onClick={handleAbrirEditor}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {isLoading ? "Cargando…" : "Editar variables"}
        </button>
      </div>
    </div>
  );
}

function SmallBtn({
  children,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-body text-xs px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
