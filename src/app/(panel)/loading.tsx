const bloque = "rounded-[var(--radius-md)] bg-surface border border-border";

export default function PanelLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-7 px-5 md:px-10 pt-7 pb-14 animate-pulse"
    >
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-32 rounded bg-elevated" />
        <div className="h-8 w-56 rounded bg-elevated" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${bloque} h-24`} />
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className={`${bloque} h-80 flex-[2_1_560px] min-w-0`} />
        <div className={`${bloque} h-80 flex-[1_1_300px] min-w-0`} />
      </div>
    </div>
  );
}
