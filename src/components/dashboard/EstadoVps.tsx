import Link from "next/link";
import { formatHace } from "@/lib/formatHace";

type Check = "ok" | "error";

function Fila({ nombre, estado }: { nombre: string; estado: Check }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`size-[7px] shrink-0 ${
          estado === "ok"
            ? "rounded-full bg-state-running"
            : "rounded-[2px] bg-state-error"
        }`}
      />
      <span>{nombre}</span>
      <span
        className={`ml-auto ${estado === "ok" ? "text-text-muted" : "text-error-text"}`}
      >
        {estado === "ok" ? "ok" : "sin conexión"}
      </span>
    </div>
  );
}

function FilaBackups({
  habilitado,
  ultimaCorrecta,
}: {
  habilitado: boolean;
  ultimaCorrecta: Date | null;
}) {
  const sinCopia = habilitado && !ultimaCorrecta;
  return (
    <Link
      href="/configuracion?seccion=backups"
      className="flex items-center gap-2.5 hover:text-text-primary"
    >
      <span
        aria-hidden="true"
        className={`size-[7px] shrink-0 ${
          sinCopia
            ? "rounded-[2px] bg-state-error"
            : habilitado
              ? "rounded-full bg-state-running"
              : "rounded-full bg-state-stopped"
        }`}
      />
      <span>Backups</span>
      <span
        className={`ml-auto ${sinCopia ? "text-error-text" : "text-text-muted"}`}
      >
        {!habilitado
          ? "Desactivados"
          : ultimaCorrecta
            ? formatHace(ultimaCorrecta)
            : "ninguna correcta"}
      </span>
    </Link>
  );
}

function textoDias(dias: number): string {
  if (dias <= 0) return "hoy";
  return `${dias} día${dias === 1 ? "" : "s"}`;
}

export function EstadoVps({
  checks,
  version,
  certificados,
  backups,
}: {
  checks: { database: Check; docker: Check; proxy: Check; certificados: Check };
  version: string;
  certificados: Array<{ proyectoId: string; nombre: string; dias: number }>;
  backups?: { habilitado: boolean; ultimaCorrecta: Date | null };
}) {
  const n = certificados.length;
  const ilegibles = checks.certificados === "error";
  return (
    <section
      aria-labelledby="estado-vps"
      className="flex flex-col gap-3.5 px-5 py-4 rounded-[var(--radius-lg)] bg-surface border border-border font-body text-[13px]"
    >
      <h2 id="estado-vps" className="font-display text-[15px] font-semibold">
        VPS
      </h2>
      <div className="flex flex-col gap-2.5">
        <Fila nombre="PostgreSQL" estado={checks.database} />
        <Fila nombre="Docker daemon" estado={checks.docker} />
        <Fila nombre="Traefik" estado={checks.proxy} />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={`size-[7px] shrink-0 ${
                ilegibles
                  ? "rounded-[2px] bg-state-error"
                  : n > 0
                    ? "rounded-full bg-state-deploying"
                    : "rounded-full bg-state-running"
              }`}
            />
            <span>Certificados</span>
            <span
              className={`ml-auto ${
                ilegibles
                  ? "text-error-text"
                  : n > 0
                    ? "text-deploying-text"
                    : "text-text-muted"
              }`}
            >
              {ilegibles
                ? "no se pueden leer"
                : n > 0
                  ? `${n} caduca${n === 1 ? "" : "n"} pronto`
                  : "vigentes"}
            </span>
          </div>
          {certificados.map((c) => (
            <Link
              key={c.proyectoId}
              href={`/proyectos/${c.proyectoId}`}
              className="flex justify-between pl-[17px] text-xs text-text-secondary hover:text-text-primary"
            >
              <span>{c.nombre}</span>
              <span>{textoDias(c.dias)}</span>
            </Link>
          ))}
        </div>
        {backups && <FilaBackups {...backups} />}
      </div>
      <div className="flex justify-between pt-3 border-t border-border text-xs text-text-muted">
        <span>Panel</span>
        <Link href="/novedades" className="hover:text-text-primary">
          v{version}
        </Link>
      </div>
    </section>
  );
}
