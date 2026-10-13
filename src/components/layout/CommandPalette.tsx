"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoServicio } from "@/lib/mock-data";
import { EstadoMarca } from "@/components/dashboard/StatusBadge";

export type ProyectoIndice = {
  id: string;
  nombre: string;
  cliente: string;
  estado: EstadoServicio;
  dominio: string | null;
};

type Opcion = {
  id: string;
  href: string;
  etiqueta: string;
  detalle: string;
  estado?: EstadoServicio;
  buscable: string;
};

const PAGINAS: Opcion[] = [
  {
    id: "pag-dashboard",
    href: "/",
    etiqueta: "Dashboard",
    detalle: "página",
    buscable: "dashboard inicio",
  },
  {
    id: "pag-proyectos",
    href: "/proyectos",
    etiqueta: "Proyectos",
    detalle: "página",
    buscable: "proyectos clientes",
  },
  {
    id: "pag-usuarios",
    href: "/usuarios",
    etiqueta: "Usuarios",
    detalle: "página",
    buscable: "usuarios",
  },
  {
    id: "pag-config",
    href: "/configuracion",
    etiqueta: "Configuración",
    detalle: "página",
    buscable: "configuración configuracion notificaciones credenciales",
  },
];

export function CommandPalette({ proyectos }: { proyectos: ProyectoIndice[] }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [activa, setActiva] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta(true);
      }
    }
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  useEffect(() => {
    if (abierta) inputRef.current?.focus();
  }, [abierta]);

  const opciones = useMemo(() => {
    const todas: Opcion[] = [
      ...proyectos.map((p) => ({
        id: p.id,
        href: `/proyectos/${p.id}`,
        etiqueta: `${p.cliente} / ${p.nombre}`,
        detalle: p.dominio ?? "sin dominio",
        estado: p.estado,
        buscable: `${p.cliente} ${p.nombre} ${p.dominio ?? ""}`.toLowerCase(),
      })),
      ...PAGINAS,
    ];
    const q = consulta.trim().toLowerCase();
    return q ? todas.filter((o) => o.buscable.includes(q)) : todas;
  }, [proyectos, consulta]);

  function cerrar() {
    setAbierta(false);
    setConsulta("");
    setActiva(0);
  }

  function ir(opcion: Opcion | undefined) {
    if (!opcion) return;
    router.push(opcion.href);
    cerrar();
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(opciones[activa]);
    } else if (e.key === "Escape") {
      cerrar();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="flex w-full items-center gap-2.5 min-h-10 px-3 rounded-[var(--radius-md)] border border-border-strong bg-surface text-text-muted font-body text-[13px] hover:text-text-primary transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span>Buscar…</span>
        <kbd className="ml-auto font-body text-[11px] border border-border-strong rounded-[var(--radius-sm)] px-1.5">
          ⌘K
        </kbd>
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Buscar"
            className="w-full max-w-[560px] overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface shadow-[var(--shadow-dramatic)]"
          >
            <input
              ref={inputRef}
              role="combobox"
              aria-label="Buscar proyecto o página"
              aria-expanded="true"
              aria-controls={listaId}
              aria-activedescendant={
                opciones[activa]
                  ? `${listaId}-${opciones[activa].id}`
                  : undefined
              }
              value={consulta}
              onChange={(e) => {
                setConsulta(e.target.value);
                setActiva(0);
              }}
              onKeyDown={alTeclear}
              placeholder="Proyecto, cliente, dominio o página…"
              className="w-full min-h-12 px-4 border-b border-border bg-transparent font-body text-sm text-text-primary placeholder:text-text-muted outline-none"
            />
            <ul
              id={listaId}
              role="listbox"
              aria-label="Resultados"
              className="max-h-[50vh] overflow-y-auto py-1.5"
            >
              {opciones.length === 0 && (
                <li className="px-4 py-3 font-body text-xs text-text-muted">
                  Sin resultados
                </li>
              )}
              {opciones.map((o, i) => (
                <li
                  key={o.id}
                  id={`${listaId}-${o.id}`}
                  role="option"
                  aria-selected={i === activa}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => ir(o)}
                  className={`flex items-center gap-2.5 px-4 min-h-10 cursor-pointer font-body text-[13px] ${
                    i === activa
                      ? "bg-elevated text-text-primary"
                      : "text-text-secondary"
                  }`}
                >
                  {o.estado ? (
                    <EstadoMarca estado={o.estado} />
                  ) : (
                    <span className="size-[7px]" aria-hidden="true" />
                  )}
                  <span className="truncate">{o.etiqueta}</span>
                  <span className="ml-auto truncate text-[11.5px] text-text-muted">
                    {o.detalle}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
