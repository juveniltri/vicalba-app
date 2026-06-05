"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarClienteAction } from "@/app/(panel)/actions";
import type { ClienteConProyectos } from "@/lib/schemas/dashboard";
import { ClienteFormModal } from "./ClienteForm";
import { ProjectCard } from "./ProjectCard";
import { ProyectoFormModal } from "./ProyectoForm";

export function ClientSection({ cliente }: { cliente: ClienteConProyectos }) {
  const router = useRouter();
  const [showEditCliente, setShowEditCliente] = useState(false);
  const [showNuevoProyecto, setShowNuevoProyecto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleEliminarCliente() {
    setDeleteLoading(true);
    setDeleteError(null);
    const result = await eliminarClienteAction(cliente.id);
    if (result?.error) {
      setDeleteError(result.error);
      setDeleteLoading(false);
      return;
    }
    router.refresh();
  }

  return (
    <section aria-label={cliente.nombre}>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest whitespace-nowrap">
          {cliente.nombre}
        </h2>
        <div className="flex-1 h-px bg-border" />

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="font-body text-xs text-state-error">
              ¿Eliminar cliente?
            </span>
            <button
              onClick={handleEliminarCliente}
              disabled={deleteLoading}
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-state-error text-state-error hover:bg-state-error/10 disabled:opacity-40 transition-opacity duration-[var(--duration-fast)]"
            >
              {deleteLoading ? "…" : "Sí"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNuevoProyecto(true)}
              aria-label="Nuevo proyecto"
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
            >
              + Proyecto
            </button>
            <button
              onClick={() => setShowEditCliente(true)}
              aria-label="Editar cliente"
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
            >
              Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Eliminar cliente"
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-state-error hover:text-state-error transition-opacity duration-[var(--duration-fast)]"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {deleteError && (
        <p role="alert" className="font-body text-xs text-state-error mb-2">
          {deleteError}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cliente.proyectos.map((proyecto) => (
          <ProjectCard key={proyecto.id} proyecto={proyecto} />
        ))}
      </div>

      {showEditCliente && (
        <ClienteFormModal
          cliente={{
            id: cliente.id,
            slug: cliente.slug,
            nombre: cliente.nombre,
          }}
          onClose={() => setShowEditCliente(false)}
        />
      )}

      {showNuevoProyecto && (
        <ProyectoFormModal
          clienteId={cliente.id}
          onClose={() => setShowNuevoProyecto(false)}
        />
      )}
    </section>
  );
}
