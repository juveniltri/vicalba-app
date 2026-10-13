"use client";

import { useMemo, useState } from "react";
import type {
  ClienteConProyectos,
  EstadoServicio,
} from "@/lib/schemas/dashboard";
import { ClientSection } from "./ClientSection";
import { EstadoMarca } from "./StatusBadge";

type Filtro = "todos" | EstadoServicio;

const FILTROS: Array<{ id: Filtro; etiqueta: string }> = [
  { id: "todos", etiqueta: "Todos" },
  { id: "error", etiqueta: "Error" },
  { id: "deploying", etiqueta: "Deploying" },
  { id: "running", etiqueta: "Running" },
  { id: "stopped", etiqueta: "Stopped" },
];

export function ProyectosExplorer({
  clientes,
}: {
  clientes: ClienteConProyectos[];
}) {
  const [consulta, setConsulta] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const todos = clientes.flatMap((c) => c.proyectos);
  const cuenta = (f: Filtro) =>
    f === "todos" ? todos.length : todos.filter((p) => p.estado === f).length;

  const q = consulta.trim().toLowerCase();
  const filtrando = q !== "" || filtro !== "todos";

  const visibles = useMemo(
    () =>
      clientes
        .map((c) => ({
          ...c,
          proyectos: c.proyectos.filter(
            (p) =>
              (filtro === "todos" || p.estado === filtro) &&
              (!q ||
                [c.nombre, p.nombre, p.dominio, p.repositorioUrl]
                  .filter(Boolean)
                  .some((campo) => campo!.toLowerCase().includes(q))),
          ),
        }))
        .filter((c) => !filtrando || c.proyectos.length > 0),
    [clientes, filtro, q, filtrando],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          aria-label="Filtrar proyectos"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Filtrar por nombre, dominio o repo…"
          className="flex-[1_1_280px] min-h-10 px-3.5 rounded-[var(--radius-md)] border border-border-strong bg-surface font-body text-[13px] text-text-primary placeholder:text-text-muted"
        />
        <div
          role="group"
          aria-label="Estado"
          className="flex flex-wrap gap-1.5"
        >
          {FILTROS.map((f) => {
            const activo = filtro === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltro(f.id)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 rounded-full border font-body text-xs transition-colors ${
                  activo
                    ? "border-[var(--color-accent)] bg-elevated text-text-primary"
                    : "border-border-strong text-text-secondary hover:text-text-primary"
                }`}
              >
                {f.id !== "todos" && <EstadoMarca estado={f.id} />}
                {f.etiqueta} {cuenta(f.id)}
              </button>
            );
          })}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="py-16 text-center font-body text-[12.5px] text-text-muted">
          Ningún proyecto coincide con el filtro.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {visibles.map((c) => (
            <ClientSection key={c.id} cliente={c} />
          ))}
        </div>
      )}
    </div>
  );
}
