import { formatHace } from "@/lib/formatHace";

type Deploy = {
  id: string;
  rama: string;
  sha: string | null;
  resultado: "en_curso" | "exito" | "error";
  output: string | null;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
};

export function HistorialDeploys({
  deploys,
  isDeploying,
  onRollback,
}: {
  deploys: Deploy[];
  isDeploying: boolean;
  onRollback: (deployId: string) => Promise<unknown>;
}) {
  if (deploys.length === 0) {
    return (
      <p className="font-body text-sm text-text-muted">
        Sin deploys registrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {deploys.map((d) => {
        const duracion = d.finalizadoEn
          ? `${Math.round(
              (d.finalizadoEn.getTime() - d.iniciadoEn.getTime()) / 1000,
            )}s`
          : "—";

        const colorResultado =
          d.resultado === "exito"
            ? "text-state-running"
            : d.resultado === "error"
              ? "text-state-error"
              : "text-state-deploying";

        return (
          <div
            key={d.id}
            className="border border-border rounded-[var(--radius-md)] p-4 bg-surface"
          >
            <div className="flex items-center gap-4 flex-wrap">
              <span
                className={`font-body text-xs font-semibold ${colorResultado}`}
              >
                {d.resultado}
              </span>
              <span className="font-body text-xs text-text-muted font-mono">
                {d.rama}
              </span>
              <span className="font-body text-xs text-text-muted">
                {formatHace(d.iniciadoEn)}
              </span>
              <span className="font-body text-xs text-text-muted">
                {duracion}
              </span>
              {d.resultado === "exito" && d.sha && (
                <form
                  action={async () => {
                    await onRollback(d.id);
                  }}
                >
                  <button
                    type="submit"
                    disabled={isDeploying}
                    className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
                  >
                    Rollback
                  </button>
                </form>
              )}
            </div>
            {d.output && (
              <details className="mt-3">
                <summary className="font-body text-xs text-text-muted cursor-pointer hover:text-primary-300">
                  Ver output
                </summary>
                <pre className="mt-2 font-mono text-xs text-text-primary bg-bg border border-border rounded-[var(--radius-sm)] p-3 overflow-x-auto whitespace-pre-wrap">
                  {d.output}
                </pre>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
