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

  const ghostBtn =
    "inline-flex items-center gap-1.5 font-display text-xs font-medium px-[11px] py-1.5 rounded-[var(--radius-md)] border border-border bg-transparent text-text-muted hover:text-text-primary hover:bg-elevated transition-colors disabled:opacity-40";

  return (
    <section aria-label={cliente.nombre}>
      {/* Cabecera de cliente */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-[11px] font-semibold text-text-muted uppercase tracking-[0.1em] whitespace-nowrap">
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
              className="font-display text-xs px-[11px] py-1.5 rounded-[var(--radius-md)] border border-state-error text-state-error hover:bg-state-error/10 disabled:opacity-40 transition-colors"
            >
              {deleteLoading ? "…" : "Confirmar"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className={ghostBtn}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowNuevoProyecto(true)}
              className={`${ghostBtn} text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-border))] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/8`}
            >
              + Proyecto
            </button>
            <button
              onClick={() => setShowEditCliente(true)}
              className={ghostBtn}
            >
              Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className={`${ghostBtn} hover:text-state-error hover:border-state-error`}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {deleteError && (
        <p role="alert" className="font-body text-xs text-state-error mb-3">
          {deleteError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-[18px] max-md:grid-cols-1">
        {cliente.proyectos.map((proyecto) => (
          <ProjectCard
            key={proyecto.id}
            p={proyecto}
            clienteNombre={cliente.nombre}
          />
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
