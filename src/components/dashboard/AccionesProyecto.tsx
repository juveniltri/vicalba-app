"use client";

import { useState } from "react";
import { useFijados } from "@/hooks/useFijados";
import { botonSecundario } from "@/components/layout/PageHeader";
import { IconLogs } from "@/components/ui/icons";
import { LogsModal } from "./LogsModal";

export function BotonFijar({ proyectoId }: { proyectoId: string }) {
  const { estaFijado, alternar } = useFijados();
  const fijado = estaFijado(proyectoId);
  return (
    <button
      type="button"
      aria-pressed={fijado}
      aria-label={fijado ? "Quitar de fijados" : "Fijar en la barra lateral"}
      title={fijado ? "Quitar de fijados" : "Fijar en la barra lateral"}
      onClick={() => alternar(proyectoId)}
      className={`inline-flex items-center justify-center size-10 rounded-[var(--radius-md)] border transition-colors ${
        fijado
          ? "border-[var(--color-accent)] text-accent-text bg-elevated"
          : "border-border-strong text-text-secondary hover:text-text-primary hover:bg-elevated"
      }`}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill={fijado ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6z" />
      </svg>
    </button>
  );
}

export function BotonLogsContenedor({
  proyectoId,
  proyectoNombre,
}: {
  proyectoId: string;
  proyectoNombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={botonSecundario}
      >
        <IconLogs className="w-[13px] h-[13px]" /> Logs del contenedor
      </button>
      <LogsModal
        proyectoId={proyectoId}
        proyectoNombre={proyectoNombre}
        open={abierto}
        onClose={() => setAbierto(false)}
      />
    </>
  );
}
