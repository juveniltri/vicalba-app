import type { EstadoServicio } from "@/lib/mock-data";

const config: Record<
  EstadoServicio,
  { label: string; dot: string; text: string }
> = {
  running: {
    label: "running",
    dot: "bg-state-running",
    text: "text-state-running",
  },
  stopped: {
    label: "stopped",
    dot: "bg-state-stopped",
    text: "text-state-stopped",
  },
  error: { label: "error", dot: "bg-state-error", text: "text-state-error" },
  deploying: {
    label: "deploying",
    dot: "bg-state-deploying",
    text: "text-state-deploying",
  },
};

export function StatusBadge({ estado }: { estado: EstadoServicio }) {
  const { label, dot, text } = config[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-body text-xs ${text}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
