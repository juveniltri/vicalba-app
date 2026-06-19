"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearVolumenAction,
  eliminarVolumenAction,
} from "@/app/(panel)/actions";
import { ExploradorVolumenModal } from "./ExploradorVolumenModal";

type Volumen = {
  id: string;
  nombre: string;
  rutaContenedor: string;
  creadoEn: Date;
};

export function VolumenesPanel({
  proyectoId,
  volumenesIniciales,
}: {
  proyectoId: string;
  volumenesIniciales: Volumen[];
}) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modalVolumen, setModalVolumen] = useState<Volumen | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [rutaContenedor, setRutaContenedor] = useState("");

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await crearVolumenAction(proyectoId, nombre, rutaContenedor);
    if (result && "error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setNombre("");
    setRutaContenedor("");
    setShowAddForm(false);
    router.refresh();
    setLoading(false);
  }

  async function handleEliminar(id: string) {
    setLoading(true);
    setError(null);
    const result = await eliminarVolumenAction(id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setConfirmDeleteId(null);
    if (modalVolumen?.id === id) setModalVolumen(null);
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

      {volumenesIniciales.length > 0 && (
        <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Nombre</Th>
                <Th>Ruta en contenedor</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {volumenesIniciales.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                >
                  <td className="px-4 py-3 font-mono text-sm text-text-primary">
                    {v.nombre}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {v.rutaContenedor}
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === v.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs text-state-error">
                          ¿Eliminar?
                        </span>
                        <Btn
                          onClick={() => handleEliminar(v.id)}
                          disabled={loading}
                          aria-label="Confirmar eliminación"
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
                          onClick={() => setModalVolumen(v)}
                          aria-label={`Explorar ficheros de ${v.nombre}`}
                        >
                          Explorar
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(v.id)}
                          aria-label={`Eliminar volumen ${v.nombre}`}
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

      <ExploradorVolumenModal
        volumen={modalVolumen ?? { id: "", nombre: "" }}
        open={modalVolumen !== null}
        onClose={() => setModalVolumen(null)}
      />

      {volumenesIniciales.length === 0 && !showAddForm && (
        <p className="font-body text-xs text-text-muted">
          Sin volúmenes configurados.
        </p>
      )}

      {showAddForm ? (
        <form
          onSubmit={handleCrear}
          className="flex flex-col gap-3 border border-border rounded-[var(--radius-md)] p-4"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="vol-nombre"
              className="font-body text-xs text-text-muted"
            >
              Nombre del volumen
            </label>
            <input
              id="vol-nombre"
              type="text"
              placeholder="galeria"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              pattern="[a-z0-9_-]+"
              title="Solo letras minúsculas, números, guiones y guiones bajos"
              className="font-mono text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="vol-contenedor"
              className="font-body text-xs text-text-muted"
            >
              Ruta en el contenedor
            </label>
            <input
              id="vol-contenedor"
              type="text"
              placeholder="/app/public/galeria"
              value={rutaContenedor}
              onChange={(e) => setRutaContenedor(e.target.value)}
              required
              className="font-mono text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
            />
          </div>
          <div className="flex gap-2">
            <Btn primary disabled={loading} aria-label="Guardar volumen">
              {loading ? "…" : "Guardar"}
            </Btn>
            <Btn
              onClick={() => {
                setShowAddForm(false);
                setNombre("");
                setRutaContenedor("");
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
          + Nuevo volumen
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
