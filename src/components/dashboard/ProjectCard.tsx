"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  detenerAction,
  iniciarAction,
  restartAction,
} from "@/app/(panel)/actions";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ proyecto }: { proyecto: ProyectoResumen }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDeploying = proyecto.estado === "deploying" || loading;

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
        <ActionButton
          onClick={() => setLoading(true)}
          disabled={isDeploying}
          primary
        >
          {isDeploying ? "Deploying..." : "Deploy"}
        </ActionButton>
      </div>
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
