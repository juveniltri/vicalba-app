"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualizarVariableAction,
  crearVariableAction,
  eliminarVariableAction,
  revelarVariableAction,
  toggleBuildTimeAction,
} from "@/app/(panel)/actions";

type VariableResumen = {
  id: string;
  clave: string;
  enBuildTime: boolean;
  creadoEn: Date;
};

export function VariablesPanel({
  proyectoId,
  variablesIniciales,
}: {
  proyectoId: string;
  variablesIniciales: VariableResumen[];
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClave, setNewClave] = useState("");
  const [newValor, setNewValor] = useState("");
  const [newEnBuildTime, setNewEnBuildTime] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  async function handleRevelar(id: string) {
    const result = await revelarVariableAction(id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setRevealed((prev) => ({ ...prev, [id]: result.valor }));
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 30_000);
  }

  async function handleGuardarEdicion(id: string) {
    setLoading(true);
    setError(null);
    const result = await actualizarVariableAction(id, editValue);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setEditingId(null);
    setEditValue("");
    router.refresh();
    setLoading(false);
  }

  async function handleConfirmarEliminar(id: string) {
    setLoading(true);
    setError(null);
    const result = await eliminarVariableAction(id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setConfirmDeleteId(null);
    router.refresh();
    setLoading(false);
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await crearVariableAction(
      proyectoId,
      newClave,
      newValor,
      newEnBuildTime,
    );
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setNewClave("");
    setNewValor("");
    setNewEnBuildTime(false);
    setShowAddForm(false);
    router.refresh();
    setLoading(false);
  }

  async function handleToggleBuildTime(id: string, current: boolean) {
    setLoading(true);
    setError(null);
    const result = await toggleBuildTimeAction(id, !current);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      {variablesIniciales.length === 0 && !showAddForm ? (
        <p className="font-body text-xs text-text-muted">
          Sin variables configuradas.
        </p>
      ) : (
        <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Clave</Th>
                <Th>Valor</Th>
                <Th>Build time</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {variablesIniciales.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                >
                  <td className="px-4 py-3 font-body text-sm text-text-primary">
                    {v.clave}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={v.enBuildTime}
                      aria-label={`Build time ${v.enBuildTime ? "activado" : "desactivado"}`}
                      disabled={loading}
                      onClick={() => handleToggleBuildTime(v.id, v.enBuildTime)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-[var(--duration-fast)] disabled:opacity-40 ${
                        v.enBuildTime ? "bg-primary-500" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-[var(--duration-fast)] ${
                          v.enBuildTime ? "translate-x-4" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <input
                        aria-label="Nuevo valor"
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 w-full"
                      />
                    ) : (
                      <span className="font-body text-xs text-text-muted">
                        {revealed[v.id] ?? "••••••••"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <div className="flex items-center gap-2">
                        <Btn
                          onClick={() => handleGuardarEdicion(v.id)}
                          disabled={loading}
                          aria-label="Guardar"
                        >
                          Guardar
                        </Btn>
                        <Btn
                          onClick={() => {
                            setEditingId(null);
                            setEditValue("");
                          }}
                          aria-label="Cancelar"
                        >
                          Cancelar
                        </Btn>
                      </div>
                    ) : confirmDeleteId === v.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs text-state-error">
                          ¿Eliminar?
                        </span>
                        <Btn
                          onClick={() => handleConfirmarEliminar(v.id)}
                          disabled={loading}
                          aria-label="Confirmar"
                        >
                          Confirmar
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label="Cancelar"
                        >
                          Cancelar
                        </Btn>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Btn
                          onClick={() => handleRevelar(v.id)}
                          aria-label="Revelar"
                        >
                          Revelar
                        </Btn>
                        <Btn
                          onClick={() => {
                            setEditingId(v.id);
                            setEditValue("");
                          }}
                          aria-label="Editar"
                        >
                          Editar
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(v.id)}
                          aria-label="Eliminar"
                        >
                          Eliminar
                        </Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm ? (
        <form onSubmit={handleCrear} className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            <input
              aria-label="Clave"
              type="text"
              placeholder="NOMBRE_VARIABLE"
              value={newClave}
              onChange={(e) => setNewClave(e.target.value.toUpperCase())}
              required
              className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 flex-1"
            />
            <input
              aria-label="Valor"
              type="text"
              placeholder="valor del secret"
              value={newValor}
              onChange={(e) => setNewValor(e.target.value)}
              required
              className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 flex-1"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer self-start">
            <button
              type="button"
              role="switch"
              aria-checked={newEnBuildTime}
              onClick={() => setNewEnBuildTime((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-[var(--duration-fast)] ${
                newEnBuildTime ? "bg-primary-500" : "bg-border"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-[var(--duration-fast)] ${
                  newEnBuildTime ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
            <span className="font-body text-xs text-text-muted">
              Disponible en build time
            </span>
          </label>
          <div className="flex gap-2">
            <Btn primary disabled={loading} aria-label="Guardar">
              {loading ? "…" : "Guardar"}
            </Btn>
            <Btn
              onClick={() => {
                setShowAddForm(false);
                setNewClave("");
                setNewValor("");
                setNewEnBuildTime(false);
              }}
              aria-label="Cancelar"
            >
              Cancelar
            </Btn>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="self-start font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors duration-[var(--duration-fast)]"
        >
          + Añadir variable
        </button>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-body text-xs text-text-muted uppercase tracking-wider">
      {children}
    </th>
  );
}

function Btn({
  children,
  onClick,
  disabled = false,
  primary = false,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border transition-colors duration-[var(--duration-fast)] disabled:opacity-40 ${
        primary
          ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-700"
          : "border-border text-text-muted hover:border-primary-300"
      }`}
    >
      {children}
    </button>
  );
}
