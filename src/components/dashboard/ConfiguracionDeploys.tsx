"use client";

import { useState, useTransition } from "react";
import { guardarConfiguracionDeploysAction } from "@/app/(panel)/actions";
import { useToast } from "@/components/ui/Toast";

export function ConfiguracionDeploys({
  timeoutMinutos,
}: {
  timeoutMinutos: number;
}) {
  const [valor, setValor] = useState(String(timeoutMinutos));
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const guardar = () => {
    startTransition(async () => {
      const result = await guardarConfiguracionDeploysAction(Number(valor));
      if (result && "error" in result) toast.error(result.error);
      else toast.success("Configuración guardada");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="deploy-timeout"
          className="font-body text-xs text-text-muted"
        >
          Tiempo máximo de deploy (min)
        </label>
        <input
          id="deploy-timeout"
          type="number"
          inputMode="numeric"
          min={0}
          max={180}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="min-h-10 w-32 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
        />
        <p className="font-body text-xs text-text-muted">
          Un deploy que supere este tiempo se cancela solo y se notifica. Entre
          5 y 180 minutos; 0 lo desactiva.
        </p>
      </div>
      <button
        type="button"
        onClick={guardar}
        disabled={isPending}
        className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {isPending ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}
