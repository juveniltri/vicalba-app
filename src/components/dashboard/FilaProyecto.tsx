"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deployProyectoAction } from "@/app/(panel)/actions";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";
import { diasHasta, shaCorto } from "@/lib/formatHace";
import { StatusBadge } from "./StatusBadge";
import { AbrirUrlBoton } from "./AbrirUrlBoton";
import { LogsModal } from "./LogsModal";
import { RESULTADO_DEPLOY } from "./DeploysRecientes";
import { IconLogs, IconRedeploy } from "@/components/ui/icons";

const DIAS_AVISO_TLS = 21;

const FONDO_FILA: Record<ProyectoResumen["estado"], string> = {
  running: "",
  stopped: "",
  error: "bg-error-bg",
  deploying: "bg-deploying-bg",
};

const botonIcono =
  "inline-flex items-center justify-center size-9 rounded-[var(--radius-md)] border border-border-strong text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors disabled:opacity-50";

function EtiquetaTls({ ssl }: { ssl: ProyectoResumen["ssl"] }) {
  if (!ssl) return null;
  if (!ssl.activo)
    return <span className="text-[11px] text-error-text">sin TLS</span>;
  const dias = ssl.caducaEn ? diasHasta(ssl.caducaEn) : null;
  if (dias !== null && dias < DIAS_AVISO_TLS)
    return (
      <span className="text-[11px] text-deploying-text">TLS {dias} d</span>
    );
  return <span className="text-[11px] text-running-text">TLS</span>;
}

export function FilaProyecto({ p }: { p: ProyectoResumen }) {
  const router = useRouter();
  const [logsAbiertos, setLogsAbiertos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lanzando, startTransition] = useTransition();
  const ultimo = p.ultimoDeploy;
  const resultado = ultimo?.resultado
    ? RESULTADO_DEPLOY[ultimo.resultado]
    : null;

  function desplegar() {
    setError(null);
    startTransition(async () => {
      const res = await deployProyectoAction(p.id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <tr className={`border-t border-border ${FONDO_FILA[p.estado]}`}>
      <td className="px-5 py-3">
        <Link
          href={`/proyectos/${p.id}`}
          className="flex items-center gap-2.5 text-text-primary hover:text-accent-text"
        >
          <StatusBadge estado={p.estado} />
          <span className="font-semibold">{p.nombre}</span>
        </Link>
        {error && (
          <p role="alert" className="mt-1 text-[11.5px] text-error-text">
            {error}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-text-secondary">{p.tipo}</td>
      <td className="px-3 py-3">
        {p.dominio ? (
          <span className="flex items-center gap-2">
            <span className="truncate">{p.dominio}</span>
            <EtiquetaTls ssl={p.ssl} />
          </span>
        ) : (
          <span className="text-text-muted">sin dominio</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="text-accent-text">{shaCorto(ultimo?.sha) ?? "—"}</span>{" "}
        <span className="text-text-muted">{ultimo?.rama ?? p.rama}</span>
      </td>
      <td className="px-3 py-3 text-text-secondary">
        {ultimo ? (
          <>
            {ultimo.hace}
            {resultado && (
              <span className={resultado.clase}>
                {" "}
                · <span aria-hidden="true">{resultado.simbolo} </span>
                {resultado.texto}
              </span>
            )}
          </>
        ) : (
          <span className="text-text-muted">sin deploys</span>
        )}
      </td>
      <td className="px-5 py-2">
        <div className="flex items-center justify-end gap-1">
          {p.estado === "deploying" ? (
            <Link
              href={`/proyectos/${p.id}`}
              className="inline-flex items-center min-h-9 px-3 rounded-[var(--radius-md)] border border-deploying-border text-deploying-text text-xs"
            >
              Ver log
            </Link>
          ) : (
            <button
              type="button"
              onClick={desplegar}
              disabled={lanzando}
              aria-label={`Deploy de ${p.nombre}`}
              title="Deploy"
              className={botonIcono}
            >
              <IconRedeploy className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setLogsAbiertos(true)}
            aria-label={`Logs de ${p.nombre}`}
            title="Logs del contenedor"
            className={botonIcono}
          >
            <IconLogs className="w-3.5 h-3.5" />
          </button>
          <AbrirUrlBoton
            dominio={p.dominio}
            sslActivo={p.sslActivo}
            className={botonIcono}
          />
        </div>
        <LogsModal
          proyectoId={p.id}
          proyectoNombre={p.nombre}
          open={logsAbiertos}
          onClose={() => setLogsAbiertos(false)}
        />
      </td>
    </tr>
  );
}
