import type { EstadoServicio } from "@/lib/mock-data";

interface StatsBarProps {
  proyectos: Array<{ estado: EstadoServicio }>;
}

export function StatsBar({ proyectos }: StatsBarProps) {
  const total = proyectos.length;
  const running = proyectos.filter((p) => p.estado === "running").length;
  const stopped = proyectos.filter((p) => p.estado === "stopped").length;
  const error = proyectos.filter((p) => p.estado === "error").length;

  return (
    <div
      className="flex flex-wrap gap-3 mb-8"
      role="region"
      aria-label="resumen de estado"
    >
      <StatPill id="stat-total" count={total} label="total" />
      <StatPill
        id="stat-running"
        count={running}
        label="running"
        colorClass="text-state-running"
      />
      <StatPill
        id="stat-stopped"
        count={stopped}
        label="stopped"
        colorClass="text-state-stopped"
      />
      <StatPill
        id="stat-error"
        count={error}
        label="error"
        colorClass="text-state-error"
      />
    </div>
  );
}

function StatPill({
  id,
  count,
  label,
  colorClass = "text-text-muted",
}: {
  id: string;
  count: number;
  label: string;
  colorClass?: string;
}) {
  return (
    <div
      data-testid={id}
      className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-4 py-2"
    >
      <span className={`font-display text-xl font-bold ${colorClass}`}>
        {count}
      </span>
      <span className="font-body text-xs text-text-muted">{label}</span>
    </div>
  );
}
