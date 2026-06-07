"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deployProyectoAction,
  detenerAction,
  eliminarProyectoAction,
  iniciarAction,
  restartAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";
import { useContainerLogs } from "@/hooks/useContainerLogs";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";
import { LogsPanel } from "./LogsPanel";
import { ProyectoFormModal } from "./ProyectoForm";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ proyecto }: { proyecto: ProyectoResumen }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const isDeploying = proyecto.estado === "deploying" || loading;
  const canEdit = !isDeploying;

  const {
    lines,
    connected,
    error: logsError,
    clear,
  } = useContainerLogs(logsOpen ? proyecto.id : null);

  async function handleIniciar() {
    setLoading(true);
    setError(null);
    const result = await iniciarAction(proyecto.id);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDetener() {
    setLoading(true);
    setError(null);
    const result = await detenerAction(proyecto.id);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRestart() {
    setLoading(true);
    setError(null);
    const result = await restartAction(proyecto.id);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleDeploy() {
    setLoading(true);
    setError(null);
    const result = await deployProyectoAction(proyecto.id);
    if (result?.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setLoading(false);
  }

  async function handleToggleAutoDeploy() {
    const result = await toggleAutoDeployAction(proyecto.id);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  function handleToggleLogs() {
    if (logsOpen) {
      clear();
      setLogsOpen(false);
    } else {
      setLogsOpen(true);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[var(--radius-md)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {proyecto.nombre}
        </h3>
        <StatusBadge estado={proyecto.estado} />
      </div>

      {proyecto.dominio && (
        <p className="font-body text-xs text-text-muted truncate">
          {proyecto.dominio}
        </p>
      )}

      {proyecto.ultimoDeploy && (
        <p className="font-body text-xs text-text-muted">
          {proyecto.ultimoDeploy.rama} · {proyecto.ultimoDeploy.hace}
        </p>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          aria-label="Auto-deploy"
          checked={proyecto.autoDeployHabilitado}
          onChange={handleToggleAutoDeploy}
          className="accent-primary-500"
        />
        <span className="font-body text-xs text-text-muted">Auto-deploy</span>
      </label>

      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {!isDeploying && proyecto.estado === "running" && (
          <ActionButton onClick={handleDetener}>Stop</ActionButton>
        )}
        {!isDeploying &&
          (proyecto.estado === "stopped" || proyecto.estado === "error") && (
            <ActionButton onClick={handleIniciar}>Start</ActionButton>
          )}
        {!isDeploying &&
          (proyecto.estado === "running" || proyecto.estado === "error") && (
            <ActionButton onClick={handleRestart}>Restart</ActionButton>
          )}
        <ActionButton onClick={handleDeploy} disabled={isDeploying} primary>
          {isDeploying ? "Deploying..." : "Deploy"}
        </ActionButton>
        <ActionButton onClick={handleToggleLogs}>
          {logsOpen ? "Hide Logs" : "Logs"}
        </ActionButton>
        {canEdit && (
          <>
            <ActionButton onClick={() => setShowEditModal(true)}>
              Editar
            </ActionButton>
            {confirmDelete ? (
              <>
                <span className="font-body text-xs text-state-error self-center">
                  ¿Eliminar?
                </span>
                <ActionButton
                  onClick={async () => {
                    setDeleteLoading(true);
                    const result = await eliminarProyectoAction(proyecto.id);
                    if (result?.error) {
                      setError(result.error);
                      setDeleteLoading(false);
                      setConfirmDelete(false);
                    } else {
                      router.refresh();
                    }
                  }}
                  disabled={deleteLoading}
                >
                  Sí
                </ActionButton>
                <ActionButton onClick={() => setConfirmDelete(false)}>
                  No
                </ActionButton>
              </>
            ) : (
              <ActionButton onClick={() => setConfirmDelete(true)}>
                Eliminar
              </ActionButton>
            )}
          </>
        )}
      </div>

      {logsOpen && (
        <LogsPanel
          lines={lines}
          connected={connected}
          error={logsError}
          onClose={handleToggleLogs}
        />
      )}

      {showEditModal && (
        <ProyectoFormModal
          proyecto={proyecto}
          onClose={() => setShowEditModal(false)}
        />
      )}

      <Link
        href={`/proyectos/${proyecto.id}`}
        className="self-start font-body text-xs text-text-muted hover:text-primary-300 transition-colors duration-[var(--duration-fast)]"
      >
        Ver detalle →
      </Link>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border transition-opacity duration-[var(--duration-fast)] disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-700"
          : "bg-transparent border-border text-text-primary hover:border-primary-300"
      }`}
    >
      {children}
    </button>
  );
}
