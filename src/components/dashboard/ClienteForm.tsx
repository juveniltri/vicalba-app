"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearClienteAction, editarClienteAction } from "@/app/(panel)/actions";

type ClienteData = { id: string; slug: string; nombre: string };

type ModalProps = {
  cliente?: ClienteData;
  onClose: () => void;
};

export function ClienteFormModal({ cliente, onClose }: ModalProps) {
  const router = useRouter();
  const isEdit = !!cliente;
  const [slug, setSlug] = useState(cliente?.slug ?? "");
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = isEdit
      ? await editarClienteAction(cliente!.id, nombre)
      : await crearClienteAction(slug, nombre);
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
          {isEdit ? "Editar cliente" : "Nuevo cliente"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="slug"
                className="font-body text-xs text-text-muted"
              >
                Slug
              </label>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="ej: mi-cliente"
                required
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

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
              placeholder="ej: Mi Cliente S.L."
              required
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

export function NuevoClienteButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-primary hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
      >
        Nuevo cliente
      </button>
      {open && <ClienteFormModal onClose={() => setOpen(false)} />}
    </>
  );
}
