import { Fragment } from "react";
import type { Version } from "@/lib/changelog";

// Only the two inline marks CHANGELOG.md uses; anything else stays plain
// text (React escapes it), so the file never injects markup.
export function TextoNovedad({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((parte, i) => {
        if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4)
          return <strong key={i}>{parte.slice(2, -2)}</strong>;
        if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2)
          return (
            <code
              key={i}
              className="px-1 rounded-[var(--radius-sm)] bg-elevated text-[0.95em]"
            >
              {parte.slice(1, -1)}
            </code>
          );
        return <Fragment key={i}>{parte}</Fragment>;
      })}
    </>
  );
}

function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function VersionNovedades({ version }: { version: Version }) {
  const id = `version-${version.version.replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 px-6 py-5 rounded-[var(--radius-lg)] bg-surface border border-border"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={id} className="font-display text-lg font-semibold">
          v{version.version}
        </h2>
        {version.fecha && (
          <span className="font-body text-xs text-text-muted">
            {fechaLegible(version.fecha)}
          </span>
        )}
      </header>
      {version.resumen && (
        <p className="font-body text-sm text-text-secondary">
          {version.resumen}
        </p>
      )}
      {version.apartados.map((apartado) => (
        <div key={apartado.titulo} className="flex flex-col gap-2">
          <h3 className="font-display text-sm font-semibold">
            {apartado.titulo}
          </h3>
          <ul className="flex flex-col gap-1.5 pl-4 list-disc marker:text-text-muted font-body text-[13px] leading-relaxed">
            {apartado.entradas.map((entrada) => (
              <li key={entrada}>
                <TextoNovedad texto={entrada} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
