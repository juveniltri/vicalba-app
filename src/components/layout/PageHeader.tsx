export function PageHeader({
  comando,
  titulo,
  children,
}: {
  comando: string;
  titulo: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="font-body text-xs text-text-muted">
          ~/vps{" "}
          <span className="text-[var(--color-accent)]" aria-hidden="true">
            ❯
          </span>{" "}
          {comando}
        </span>
        <h1 className="font-display text-[30px] font-bold leading-tight -tracking-[0.03em]">
          {titulo}
        </h1>
      </div>
      {children && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
        </div>
      )}
    </header>
  );
}

export const botonPrimario =
  "inline-flex items-center gap-2 min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-body text-[12.5px] font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const botonSecundario =
  "inline-flex items-center gap-2 min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong bg-transparent text-text-primary font-body text-[12.5px] hover:bg-elevated transition-colors disabled:opacity-50 disabled:pointer-events-none";
