"use client";

import { useState } from "react";
import Link from "next/link";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";
import { StatusBadge } from "./StatusBadge";
import { AbrirUrlBoton } from "./AbrirUrlBoton";
import { LogsModal } from "./LogsModal";
import {
  IconLock,
  IconGlobe,
  IconClock,
  IconLogs,
  IconRedeploy,
  IconAlert,
} from "@/components/ui/icons";

const ghostBtn =
  "inline-flex items-center gap-1.5 font-display text-xs font-medium px-[11px] py-1.5 rounded-[var(--radius-md)] border border-border bg-transparent text-text-muted hover:text-text-primary hover:bg-elevated transition-colors";

export function ProjectCard({
  p,
  clienteNombre,
}: {
  p: ProyectoResumen;
  clienteNombre: string;
}) {
  const [logsOpen, setLogsOpen] = useState(false);

  return (
    <>
      <article className="flex flex-col bg-surface border border-border rounded-[var(--radius-lg)] p-[20px_20px_16px] transition-colors hover:border-[color-mix(in_oklab,var(--color-accent)_45%,var(--color-border))]">
        {/* Cabecera */}
        <div className="flex items-start gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-bold -tracking-[0.02em] truncate">
              {p.nombre}
            </div>
            <div className="font-body text-[11.5px] text-text-muted mt-1">
              {clienteNombre}
            </div>
          </div>
          <span className="shrink-0 mt-0.5">
            <StatusBadge estado={p.estado} />
          </span>
        </div>

        {/* Dominio */}
        <div className="flex items-center gap-2 mt-[18px] min-w-0">
          {p.dominio ? (
            <>
              <IconLock className="w-[13px] h-[13px] shrink-0 text-text-muted" />
              <span className="font-body text-[12.5px] text-text-primary truncate min-w-0 flex-1">
                {p.dominio}
              </span>
              <span className="shrink-0">
                <AbrirUrlBoton dominio={p.dominio} sslActivo={p.sslActivo} />
              </span>
            </>
          ) : (
            <>
              <IconGlobe className="w-[13px] h-[13px] shrink-0 text-text-muted" />
              <span className="font-body text-[12.5px] text-text-muted truncate">
                sin dominio · red interna
              </span>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 mt-5 pt-[15px] border-t border-border">
          <span
            className={`font-body text-[11px] inline-flex items-center gap-1.5 shrink-0 max-w-[40%] ${
              p.estado === "error" ? "text-state-error" : "text-text-muted"
            }`}
          >
            {p.estado === "error" ? (
              <IconAlert className="w-3 h-3 shrink-0" />
            ) : (
              <IconClock className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">
              {p.ultimoDeploy
                ? `${p.ultimoDeploy.hace} · ${p.ultimoDeploy.rama}`
                : "sin deploys"}
            </span>
          </span>
          <span className="flex-1" />
          <button onClick={() => setLogsOpen(true)} className={ghostBtn}>
            <IconLogs className="w-[13px] h-[13px] shrink-0" /> Logs
          </button>
          <Link
            href={`/proyectos/${p.id}`}
            className={`${ghostBtn} hover:text-[var(--color-accent)] hover:border-[color-mix(in_oklab,var(--color-accent)_55%,var(--color-border))]`}
          >
            <IconRedeploy className="w-[13px] h-[13px] shrink-0" /> Ver
          </Link>
        </div>
      </article>

      <LogsModal
        proyectoId={p.id}
        proyectoNombre={p.nombre}
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
      />
    </>
  );
}
