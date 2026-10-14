"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rollbackAction } from "@/app/(panel)/actions";
import type { ProyectoAtencion } from "@/lib/schemas/dashboard";
import { shaCorto } from "@/lib/formatHace";
import { StatusBadge } from "./StatusBadge";

export function AtencionPanel({
  proyectos,
  avisoBackups = null,
}: {
  proyectos: ProyectoAtencion[];
  avisoBackups?: string | null;
}) {
  return (
    <section aria-labelledby="atencion-titulo" className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2.5">
        <h2
          id="atencion-titulo"
          className="font-display text-base font-semibold"
        >
          Requiere atención
        </h2>
        {proyectos.length > 0 && (
          <span className="font-body text-xs text-text-muted">
            {proyectos.length} proyecto{proyectos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {avisoBackups && (
        <article className="flex flex-wrap items-center gap-3 px-5 py-[18px] rounded-[var(--radius-lg)] border bg-error-bg border-error-border">
          <span className="font-display text-[15px] font-semibold">
            {avisoBackups}
          </span>
          <Link
            href="/configuracion?seccion=backups"
            className="ml-auto inline-flex items-center min-h-9 px-3.5 rounded-[var(--radius-md)] border border-error-border font-body text-[12.5px] text-error-text transition-colors hover:bg-error-border/30"
          >
            Ver backups
          </Link>
        </article>
      )}
      {proyectos.length === 0 ? (
        !avisoBackups && (
          <p className="px-5 py-4 rounded-[var(--radius-lg)] bg-surface border border-border font-body text-[12.5px] text-text-secondary">
            Todo en orden: ningún proyecto en error ni desplegando.
          </p>
        )
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {proyectos.map((p) => (
            <TarjetaAtencion key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function TarjetaAtencion({ p }: { p: ProyectoAtencion }) {
  const router = useRouter();
  const [enviando, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const esError = p.estado === "error";
  const rollbackSha = shaCorto(p.rollback?.sha);

  function hacerRollback(deployId: string) {
    setError(null);
    startTransition(async () => {
      const res = await rollbackAction(deployId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  const boton =
    "inline-flex items-center min-h-9 px-3.5 rounded-[var(--radius-md)] border font-body text-[12.5px] transition-colors disabled:opacity-50";

  return (
    <article
      className={`flex flex-col gap-3 px-5 py-[18px] rounded-[var(--radius-lg)] border ${
        esError
          ? "bg-error-bg border-error-border"
          : "bg-deploying-bg border-deploying-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusBadge estado={p.estado} />
        <span className="font-display text-[15px] font-semibold">
          {p.cliente} / {p.nombre}
        </span>
        <span className="ml-auto font-body text-xs text-text-secondary">
          {esError ? p.hace : [p.rama, p.origen].filter(Boolean).join(" · ")}
        </span>
      </div>

      {p.lineas.length > 0 && (
        <pre
          className={`m-0 px-3 py-2.5 rounded-[var(--radius-md)] bg-terminal font-body text-xs whitespace-pre-wrap break-all ${
            esError ? "text-error-text" : "text-terminal-text"
          }`}
        >
          {p.lineas.join("\n")}
        </pre>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {esError ? (
          <>
            <Link
              href={`/proyectos/${p.id}?tab=deploys`}
              className={`${boton} border-error-border text-error-text hover:bg-error-border/30`}
            >
              Ver log del deploy
            </Link>
            {p.rollback && rollbackSha && (
              <button
                type="button"
                disabled={enviando}
                onClick={() => hacerRollback(p.rollback!.deployId)}
                className={`${boton} border-border-strong text-text-primary hover:bg-elevated`}
              >
                Rollback a {rollbackSha}
              </button>
            )}
          </>
        ) : (
          <Link
            href={`/proyectos/${p.id}`}
            className={`${boton} ml-auto border-deploying-border text-deploying-text hover:bg-deploying-border/30`}
          >
            Seguir en vivo
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="font-body text-xs text-error-text">
          {error}
        </p>
      )}
    </article>
  );
}
