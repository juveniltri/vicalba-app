import type { EstadoServicio } from "@/lib/mock-data";

// Shape differs per state as well as colour, so states stay distinguishable
// for colour-blind users: square = error, hollow = stopped, filled = live.
const config: Record<
  EstadoServicio,
  { label: string; pill: string; marca: string }
> = {
  running: {
    label: "running",
    pill: "bg-running-bg text-running-text",
    marca: "rounded-full bg-state-running",
  },
  stopped: {
    label: "stopped",
    pill: "bg-stopped-bg text-stopped-text",
    marca: "rounded-full border-[1.5px] border-text-muted",
  },
  error: {
    label: "error",
    pill: "bg-error-bg text-error-text",
    marca: "rounded-[2px] bg-state-error",
  },
  deploying: {
    label: "deploying",
    pill: "bg-deploying-bg text-deploying-text",
    marca: "rounded-full bg-state-deploying animate-pulse",
  },
};

export function StatusBadge({ estado }: { estado: EstadoServicio }) {
  const { label, pill, marca } = config[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] font-body text-[10.5px] font-semibold uppercase tracking-[0.04em] ${pill}`}
    >
      <span className={`size-[7px] shrink-0 ${marca}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function EstadoMarca({ estado }: { estado: EstadoServicio }) {
  return (
    <span
      className={`size-[7px] shrink-0 inline-block ${config[estado].marca}`}
      aria-hidden="true"
    />
  );
}
