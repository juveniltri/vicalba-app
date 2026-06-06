"use client";

import { useState, useEffect } from "react";
import type { MetricasSistema as Metricas } from "@/lib/system/metrics";

const COLOR_MAP = {
  running: { text: "text-state-running", bg: "bg-state-running" },
  deploying: { text: "text-state-deploying", bg: "bg-state-deploying" },
  error: { text: "text-state-error", bg: "bg-state-error" },
} as const;

function clasesColor(pct: number): (typeof COLOR_MAP)[keyof typeof COLOR_MAP] {
  if (pct >= 90) return COLOR_MAP.error;
  if (pct >= 70) return COLOR_MAP.deploying;
  return COLOR_MAP.running;
}

function BarraMetrica({
  label,
  porcentaje,
  etiqueta,
}: {
  label: string;
  porcentaje: number;
  etiqueta: string;
}) {
  const { text, bg } = clasesColor(porcentaje);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-text-muted">{label}</span>
        <span className={`font-body text-xs font-semibold ${text}`}>
          {etiqueta}
        </span>
      </div>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-[var(--duration-slow)] ${bg}`}
          style={{ width: `${Math.min(100, porcentaje)}%` }}
        />
      </div>
    </div>
  );
}

export function MetricasSistema() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch("/api/system/metrics");
        if (res.ok) setMetricas(await res.json());
      } catch {
        // silencioso — el dashboard sigue funcionando
      }
    };
    cargar();
    const id = setInterval(cargar, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section>
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
        Métricas de sistema
      </h2>
      <div className="border border-border rounded-[var(--radius-md)] p-4 flex flex-col gap-4">
        <BarraMetrica
          label="CPU"
          porcentaje={metricas?.cpu ?? 0}
          etiqueta={metricas ? `${metricas.cpu}%` : "—"}
        />
        <BarraMetrica
          label="RAM"
          porcentaje={
            metricas ? (metricas.ram.usado / metricas.ram.total) * 100 : 0
          }
          etiqueta={
            metricas
              ? `${metricas.ram.usado} / ${metricas.ram.total} ${metricas.ram.unidad}`
              : "—"
          }
        />
        <BarraMetrica
          label="Disco"
          porcentaje={
            metricas ? (metricas.disco.usado / metricas.disco.total) * 100 : 0
          }
          etiqueta={
            metricas
              ? `${metricas.disco.usado} / ${metricas.disco.total} ${metricas.disco.unidad}`
              : "—"
          }
        />
      </div>
    </section>
  );
}
