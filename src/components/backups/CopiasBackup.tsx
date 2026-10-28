"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restaurarBackupAction } from "@/app/(panel)/actions";
import { useToast } from "@/components/ui/Toast";
import type { CopiaBackup } from "@/lib/schemas/dashboard";
import { formatearBytes, formatearFecha } from "./HistorialBackups";

const CONFIRMACION = "RESTAURAR";

export function CopiasBackup({
  copias,
}: {
  copias: CopiaBackup[] | { error: string };
}) {
  const [elegida, setElegida] = useState<CopiaBackup | null>(null);

  if ("error" in copias) {
    // Not a failure: the destination has simply not been set up yet.
    if (copias.error.startsWith("Backups sin configurar")) {
      return (
        <p className="font-body text-xs text-text-muted">{copias.error}</p>
      );
    }
    return (
      <p role="alert" className="font-body text-xs text-state-error">
        {copias.error}
      </p>
    );
  }
  if (copias.length === 0) {
    return (
      <p className="font-body text-xs text-text-muted">
        El destino aún no tiene copias
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col">
        {copias.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 border-t border-border py-2 first:border-t-0 font-body text-[12.5px]"
          >
            <span className="whitespace-nowrap">{formatearFecha(c.fecha)}</span>
            <span className="text-text-muted">
              {c.bytes === null ? "—" : formatearBytes(c.bytes)}
            </span>
            <button
              type="button"
              onClick={() => setElegida(c)}
              className="ml-auto inline-flex items-center min-h-8 px-3 rounded-[var(--radius-md)] border border-border-strong text-text-primary hover:bg-elevated"
            >
              Restaurar
            </button>
          </li>
        ))}
      </ul>
      {elegida && (
        <AvisoRestaurar copia={elegida} onCerrar={() => setElegida(null)} />
      )}
    </>
  );
}

function AvisoRestaurar({
  copia,
  onCerrar,
}: {
  copia: CopiaBackup;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const restaurar = () => {
    startTransition(async () => {
      setError(null);
      const result = await restaurarBackupAction(copia.id, texto);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Restauración iniciada");
      onCerrar();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(8,9,13,0.62)] backdrop-blur-[7px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurar-titulo"
        className="w-[560px] max-w-full flex flex-col gap-4 bg-surface border border-border rounded-[var(--radius-lg)] p-[22px] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
      >
        <h2 id="restaurar-titulo" className="text-[17px] font-semibold">
          Restaurar copia
        </h2>
        <p className="font-body text-[12.5px] leading-relaxed text-text-secondary">
          El Panel volverá al estado del {formatearFecha(copia.fecha)}:
          Proyectos, variables, usuarios, credenciales e historial de deploys.
          Se perderán los cambios hechos desde entonces. Los contenedores en
          marcha no se tocan. Antes se hará una copia automática para poder
          deshacerlo.
        </p>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="restaurar-confirmacion"
            className="font-body text-xs text-text-muted"
          >
            Escribe {CONFIRMACION} para confirmar
          </label>
          <input
            id="restaurar-confirmacion"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
          />
        </div>
        {error && (
          <p role="alert" className="font-body text-xs text-state-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={restaurar}
            disabled={texto !== CONFIRMACION || isPending}
            aria-label="Restaurar copia"
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-state-error)] font-body text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Restaurando…" : "Restaurar"}
          </button>
        </div>
      </div>
    </div>
  );
}
