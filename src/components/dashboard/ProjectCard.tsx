"use client";

import { useState } from "react";
import type { Proyecto } from "@/lib/mock-data";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ proyecto }: { proyecto: Proyecto }) {
  const [loading, setLoading] = useState(false);
  const isDeploying = proyecto.estado === "deploying" || loading;

  function handleAction(accion: string) {
    setLoading(true);
    // stub: se reemplazará con mutación tRPC
    console.log(`[ProjectCard] ${accion} → ${proyecto.id}`);
    setTimeout(() => setLoading(false), 1500);
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

      <div className="flex flex-wrap gap-2 pt-1">
        {!isDeploying && proyecto.estado === "running" && (
          <ActionButton onClick={() => handleAction("stop")}>Stop</ActionButton>
        )}
        {!isDeploying &&
          (proyecto.estado === "stopped" || proyecto.estado === "error") && (
            <ActionButton onClick={() => handleAction("start")}>
              Start
            </ActionButton>
          )}
        {!isDeploying &&
          (proyecto.estado === "running" || proyecto.estado === "error") && (
            <ActionButton onClick={() => handleAction("restart")}>
              Restart
            </ActionButton>
          )}
        <ActionButton
          onClick={() => handleAction("deploy")}
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
