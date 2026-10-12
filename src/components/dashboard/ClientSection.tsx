"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarClienteAction } from "@/app/(panel)/actions";
import type { ClienteConProyectos } from "@/lib/schemas/dashboard";
import { ClienteFormModal } from "./ClienteForm";
import { FilaProyecto } from "./FilaProyecto";
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
    "inline-flex items-center gap-1.5 min-h-9 px-3 rounded-[var(--radius-md)] border border-border-strong bg-transparent font-body text-xs text-text-secondary hover:text-text-primary hover:bg-elevated transition-colors disabled:opacity-40";
  const n = cliente.proyectos.length;

  return (
    <section
      aria-label={cliente.nombre}
      className="rounded-[var(--radius-lg)] bg-surface border border-border"
    >
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-border">
        <h2 className="font-display text-[15px] font-semibold">
          {cliente.nombre}
        </h2>
        <span className="font-body text-[11.5px] text-text-muted">
          cliente-{cliente.slug}-network · {n} proyecto{n === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />

        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="font-body text-xs text-error-text">
              ¿Eliminar cliente?
            </span>
            <button
              onClick={handleEliminarCliente}
              disabled={deleteLoading}
              className="inline-flex items-center min-h-9 px-3 rounded-[var(--radius-md)] border border-error-border font-body text-xs text-error-text hover:bg-error-bg disabled:opacity-40 transition-colors"
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
              className={`${ghostBtn} text-accent-text hover:text-accent-text`}
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
              className={`${ghostBtn} hover:text-error-text hover:border-error-border`}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {deleteError && (
        <p role="alert" className="px-5 pt-3 font-body text-xs text-error-text">
          {deleteError}
        </p>
      )}

      {n === 0 ? (
        <p className="px-5 py-5 font-body text-[12.5px] text-text-muted">
          Sin proyectos todavía.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse font-body text-[12.5px]">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="px-5 py-2.5 font-medium">Proyecto</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Dominio</th>
                <th className="px-3 py-2.5 font-medium">Commit</th>
                <th className="px-3 py-2.5 font-medium">Último deploy</th>
                <th className="px-5 py-2.5 font-medium text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cliente.proyectos.map((proyecto) => (
                <FilaProyecto key={proyecto.id} p={proyecto} />
              ))}
            </tbody>
          </table>
        </div>
      )}

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
