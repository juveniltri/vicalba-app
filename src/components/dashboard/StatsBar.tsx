import type { EstadoServicio } from "@/lib/schemas/dashboard";
import { Sparkline } from "@/components/ui/Sparkline";

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
      className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      role="region"
      aria-label="resumen de estado"
    >
      <StatCard
        id="stat-total"
        count={total}
        label="Total"
        seed={41}
        base={Math.max(total * 8, 30)}
        amp={20}
        color="var(--color-text-primary)"
      />
      <StatCard
        id="stat-running"
        count={running}
        label="Running"
        seed={17}
        base={Math.max(running * 8, 25)}
        amp={22}
        color="var(--color-state-running)"
      />
      <StatCard
        id="stat-stopped"
        count={stopped}
        label="Stopped"
        seed={63}
        base={Math.max(stopped * 8, 20)}
        amp={18}
        color="var(--color-text-muted)"
      />
      <StatCard
        id="stat-error"
        count={error}
        label="Error"
        seed={89}
        base={Math.max(error * 8, 15)}
        amp={25}
        color="var(--color-state-error)"
      />
    </div>
  );
}

function StatCard({
  id,
  count,
  label,
  seed,
  base,
  amp,
  color,
}: {
  id: string;
  count: number;
  label: string;
  seed: number;
  base: number;
  amp: number;
  color: string;
}) {
  return (
    <div
      data-testid={id}
      className="bg-surface border border-border rounded-[var(--radius-lg)] p-[15px_16px_13px]"
      style={{ color }}
    >
      <div className="font-display text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </div>
      <div className="font-display font-bold text-[28px] -tracking-[0.03em] mt-2 leading-none">
        {count}
      </div>
      <Sparkline seed={seed} base={base} amp={amp} bars={20} />
    </div>
  );
}
