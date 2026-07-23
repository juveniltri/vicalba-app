"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarCredencialAction } from "@/app/(panel)/actions";
import { Listbox } from "@/components/ui/Listbox";

type CredencialOpcion = { id: string; nombre: string };

export function CredencialSelector({
  proyectoId,
  credencialActualId,
  credenciales,
}: {
  proyectoId: string;
  credencialActualId: string | null;
  credenciales: CredencialOpcion[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(credencialActualId ?? "");
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleGuardar() {
    startTransition(async () => {
      setError(null);
      const result = await asignarCredencialAction(
        proyectoId,
        selectedId || null,
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMensaje("Credencial actualizada");
      setTimeout(() => setMensaje(null), 3000);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      {mensaje && (
        <p className="font-body text-xs text-state-running">{mensaje}</p>
      )}
      <div className="flex items-center gap-3">
        <Listbox
          ariaLabel="Credencial SSH"
          value={selectedId}
          options={[
            { value: "", label: "Sin credencial" },
            ...credenciales.map((c) => ({ value: c.id, label: c.nombre })),
          ]}
          onChange={setSelectedId}
        />
        <button
          type="button"
          onClick={handleGuardar}
          disabled={isPending}
          className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-50 transition-colors duration-[var(--duration-fast)]"
        >
          Guardar
        </button>
      </div>
      {credenciales.length === 0 && (
        <p className="font-body text-xs text-text-muted">
          Añade credenciales SSH en{" "}
          <a href="/configuracion" className="text-primary-300 hover:underline">
            Configuración
          </a>
          .
        </p>
      )}
    </div>
  );
}
