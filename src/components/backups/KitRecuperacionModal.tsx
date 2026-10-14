"use client";

import { useState, useTransition } from "react";
import { confirmarClaveBackupAction } from "@/app/(panel)/actions";

export function KitRecuperacionModal({
  kit,
  onConfirmado,
}: {
  kit: string;
  onConfirmado: () => void;
}) {
  const [guardado, setGuardado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const copiar = async () => {
    await navigator.clipboard.writeText(kit);
    setCopiado(true);
  };

  const continuar = () => {
    startTransition(async () => {
      setError(null);
      const result = await confirmarClaveBackupAction();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      onConfirmado();
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(8,9,13,0.62)] backdrop-blur-[7px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kit-titulo"
        className="w-[640px] max-w-full max-h-[calc(100vh-48px)] flex flex-col gap-4 overflow-y-auto bg-surface border border-border rounded-[var(--radius-lg)] p-[22px] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
      >
        <div className="flex flex-col gap-1">
          <h2 id="kit-titulo" className="text-[17px] font-semibold">
            Kit de recuperación
          </h2>
          <p className="font-body text-[12.5px] leading-relaxed text-text-secondary">
            Guárdalo fuera de la VPS (gestor de contraseñas). Sin la clave, las
            copias no se pueden descifrar y el Panel no la vuelve a mostrar.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-elevated border border-border p-3 font-mono text-xs leading-relaxed">
          {kit}
        </pre>
        <button
          type="button"
          onClick={() => void copiar()}
          className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <label className="flex items-center gap-2 font-body text-[13px]">
          <input
            type="checkbox"
            checked={guardado}
            onChange={(e) => setGuardado(e.target.checked)}
          />
          He guardado el kit fuera de la VPS
        </label>
        {error && (
          <p role="alert" className="font-body text-xs text-state-error">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={continuar}
          disabled={!guardado || isPending}
          className="self-end inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
