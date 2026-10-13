import Link from "next/link";
import type { DeployReciente } from "@/lib/schemas/dashboard";
import { shaCorto } from "@/lib/formatHace";

export const RESULTADO_DEPLOY = {
  exito: { simbolo: "✓", texto: "éxito", clase: "text-running-text" },
  error: { simbolo: "■", texto: "error", clase: "text-error-text" },
  en_curso: { simbolo: "●", texto: "en curso", clase: "text-deploying-text" },
} as const;

export function DeploysRecientes({ deploys }: { deploys: DeployReciente[] }) {
  return (
    <section
      aria-labelledby="deploys-recientes"
      className="min-w-0 rounded-[var(--radius-lg)] bg-surface border border-border"
    >
      <div className="flex items-center px-5 py-4 border-b border-border">
        <h2
          id="deploys-recientes"
          className="font-display text-[15px] font-semibold"
        >
          Últimos deploys
        </h2>
      </div>
      {deploys.length === 0 ? (
        <p className="px-5 py-6 font-body text-[12.5px] text-text-muted">
          Aún no hay deploys.
        </p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse font-body text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-5 py-2.5 font-medium">Proyecto</th>
                <th className="px-3 py-2.5 font-medium">Commit</th>
                <th className="px-3 py-2.5 font-medium">Origen</th>
                <th className="px-3 py-2.5 font-medium">Resultado</th>
                <th className="px-5 py-2.5 font-medium text-right">Cuándo</th>
              </tr>
            </thead>
            <tbody>
              {deploys.map((d) => {
                const r = RESULTADO_DEPLOY[d.resultado];
                return (
                  <tr key={d.id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <Link
                        href={`/proyectos/${d.proyectoId}`}
                        className="text-text-primary hover:text-accent-text"
                      >
                        {d.cliente} / {d.proyecto}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-accent-text">
                        {shaCorto(d.sha) ?? "—"}
                      </span>{" "}
                      <span className="text-text-muted">{d.rama}</span>
                    </td>
                    <td className="px-3 py-3 text-text-secondary">
                      {d.origen}
                    </td>
                    <td className={`px-3 py-3 ${r.clase}`}>
                      <span aria-hidden="true">{r.simbolo} </span>
                      {r.texto}
                    </td>
                    <td className="px-5 py-3 text-right text-text-secondary">
                      {d.hace}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
