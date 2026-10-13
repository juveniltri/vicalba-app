import type { EstadoServicio } from "@/lib/schemas/dashboard";
import { EstadoMarca } from "./StatusBadge";

interface StatsBarProps {
  proyectos: Array<{ estado: EstadoServicio }>;
  clientes?: number;
}

export function StatsBar({ proyectos, clientes }: StatsBarProps) {
  const total = proyectos.length;
  const running = proyectos.filter((p) => p.estado === "running").length;
  const stopped = proyectos.filter((p) => p.estado === "stopped").length;
  const error = proyectos.filter((p) => p.estado === "error").length;

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      role="region"
      aria-label="resumen de estado"
    >
      <StatCard
        id="stat-total"
        label="Proyectos"
        count={total}
        detalle={
          clientes === undefined
            ? "en el VPS"
            : `en ${clientes} cliente${clientes === 1 ? "" : "s"}`
        }
      />
      <StatCard
        id="stat-running"
        label="Running"
        estado="running"
        count={running}
        detalle={`de ${total}`}
      />
      <StatCard
        id="stat-stopped"
        label="Stopped"
        estado="stopped"
        count={stopped}
        detalle="parados"
      />
      <StatCard
        id="stat-error"
        label="Error"
        estado="error"
        count={error}
        detalle={error > 0 ? "requieren atención" : "todo en orden"}
        alerta={error > 0}
      />
    </div>
  );
}

function StatCard({
  id,
  label,
  count,
  detalle,
  estado,
  alerta = false,
}: {
  id: string;
  label: string;
  count: number;
  detalle: string;
  estado?: EstadoServicio;
  alerta?: boolean;
}) {
  return (
    <div
      data-testid={id}
      className="flex flex-col gap-1.5 px-[18px] py-4 rounded-[var(--radius-lg)] bg-surface border border-border"
    >
      <span className="flex items-center gap-1.5 font-body text-[11.5px] text-text-muted">
        {estado && <EstadoMarca estado={estado} />}
        {label}
      </span>
      <span
        className={`font-display text-[28px] font-bold leading-none ${alerta ? "text-error-text" : ""}`}
      >
        {count}
      </span>
      <span className="font-body text-[11.5px] text-text-muted">{detalle}</span>
    </div>
  );
}
