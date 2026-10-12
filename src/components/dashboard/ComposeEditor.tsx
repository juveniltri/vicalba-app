"use client";

import dynamic from "next/dynamic";
import { loader } from "@monaco-editor/react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cargarComposeDesdeRepoAction,
  guardarComposeAction,
} from "@/app/(panel)/actions";
import { extraerServicios } from "@/lib/compose";

// Servir Monaco desde /monaco-editor/vs (copiado en prebuild) en vez de jsdelivr CDN.
// Así la CSP estricta de producción no necesita permitir dominios externos.
loader.config({ paths: { vs: "/monaco-editor/vs" } });

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-text-muted text-sm font-mono">
      Cargando editor…
    </div>
  ),
});

const DEFAULT_COMPOSE = `services:
  app:
    image: nginx:alpine
    ports:
      - "80:80"
    restart: unless-stopped
`;

export function ComposeEditor({
  proyectoId,
  composeContentInicial,
  repositorioUrl,
}: {
  proyectoId: string;
  composeContentInicial: string | null;
  repositorioUrl?: string | null;
}) {
  const router = useRouter();
  const [content, setContent] = useState(
    composeContentInicial ?? DEFAULT_COMPOSE,
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoading, startLoadTransition] = useTransition();

  const servicios = extraerServicios(content);

  function handleReload() {
    setError(null);
    startLoadTransition(async () => {
      const result = await cargarComposeDesdeRepoAction(proyectoId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setContent(result.composeContent);
      }
    });
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await guardarComposeAction(proyectoId, content);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-text-muted">Servicios:</span>
          {servicios.length === 0 ? (
            <span className="text-xs text-text-muted italic">
              (ninguno detectado)
            </span>
          ) : (
            servicios.map((s) => (
              <span
                key={s}
                className="text-xs font-mono px-2 py-0.5 rounded bg-elevated border border-border text-text-primary"
              >
                {s}
              </span>
            ))
          )}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-400 font-mono">{error}</span>
          )}
          {saved && (
            <span className="text-xs text-green-400 font-mono">✓ Guardado</span>
          )}
          {repositorioUrl && (
            <button
              onClick={handleReload}
              disabled={isLoading || isPending}
              title="Clonar/actualizar el repo y cargar su docker-compose.yml"
              className="inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-elevated border border-border text-text-primary hover:bg-surface transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {isLoading ? "Cargando…" : "↺ Recargar del repo"}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isPending || isLoading}
            className="inline-flex items-center gap-1.5 font-display text-xs font-semibold px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {isPending ? "Guardando…" : "Guardar compose"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-[var(--radius-md)] border border-border overflow-hidden bg-[#1e1e1e]">
        <MonacoEditor
          height="420px"
          language="yaml"
          value={content}
          onChange={(val) => setContent(val ?? "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
            lineNumbers: "on",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: "boundary",
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>

      <p className="text-xs text-text-muted">
        Las variables de entorno del proyecto se inyectan automáticamente como
        fichero <code className="font-mono">.env</code> junto al compose —
        puedes referenciarlas con{" "}
        <code className="font-mono">{"${VARIABLE}"}</code>.
      </p>
    </div>
  );
}
