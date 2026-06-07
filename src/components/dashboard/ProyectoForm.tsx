"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearProyectoAction,
  editarProyectoAction,
} from "@/app/(panel)/actions";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";

type ModalProps = {
  clienteId?: string;
  proyecto?: ProyectoResumen;
  onClose: () => void;
};

export function ProyectoFormModal({
  clienteId,
  proyecto,
  onClose,
}: ModalProps) {
  const router = useRouter();
  const isEdit = !!proyecto;
  const [nombre, setNombre] = useState(proyecto?.nombre ?? "");
  const [dominio, setDominio] = useState(proyecto?.dominio ?? "");
  const [repositorioUrl, setRepositorioUrl] = useState(
    proyecto?.repositorioUrl ?? "",
  );
  const [rama, setRama] = useState(proyecto?.rama ?? "main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const dominioFinal = dominio.trim() || undefined;
    const repoFinal = repositorioUrl.trim() || undefined;
    const result = isEdit
      ? await editarProyectoAction(
          proyecto!.id,
          nombre,
          dominioFinal,
          repoFinal,
          rama,
        )
      : await crearProyectoAction(
          clienteId!,
          nombre,
          dominioFinal,
          repoFinal,
          rama,
        );
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-[var(--radius-md)] p-6 w-full max-w-md">
        <h2 className="font-display text-sm font-semibold text-text-primary mb-4">
          {isEdit ? "Editar proyecto" : "Nuevo proyecto"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="nombre"
              className="font-body text-xs text-text-muted"
            >
              Nombre
            </label>
            <input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: web-app"
              required
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="dominio"
              className="font-body text-xs text-text-muted"
            >
              Dominio (opcional)
            </label>
            <input
              id="dominio"
              type="text"
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              placeholder="ej: app.micliente.com"
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="repositorioUrl"
              className="font-body text-xs text-text-muted"
            >
              Repositorio GitHub (opcional)
            </label>
            <input
              id="repositorioUrl"
              type="url"
              value={repositorioUrl}
              onChange={(e) => setRepositorioUrl(e.target.value)}
              placeholder="ej: https://github.com/org/repo"
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="rama" className="font-body text-xs text-text-muted">
              Rama
            </label>
            <input
              id="rama"
              type="text"
              value={rama}
              onChange={(e) => setRama(e.target.value)}
              placeholder="main"
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          {error && (
            <p role="alert" className="font-body text-xs text-state-error">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-primary hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-primary-500 border border-primary-500 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-[var(--duration-fast)]"
            >
              {loading ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
