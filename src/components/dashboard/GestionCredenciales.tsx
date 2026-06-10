"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearCredencialAction,
  eliminarCredencialAction,
} from "@/app/(panel)/actions";

type Credencial = {
  id: string;
  nombre: string;
  clavePublica: string;
  creadoEn: Date;
};

export function GestionCredenciales({
  credencialesIniciales,
}: {
  credencialesIniciales: Credencial[];
}) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [clavePublica, setClavePublica] = useState("");
  const [clavePrivada, setClavePrivada] = useState("");

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await crearCredencialAction(
      nombre,
      clavePublica,
      clavePrivada,
    );
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setNombre("");
    setClavePublica("");
    setClavePrivada("");
    setShowAddForm(false);
    router.refresh();
    setLoading(false);
  }

  async function handleEliminar(id: string) {
    setLoading(true);
    setError(null);
    const result = await eliminarCredencialAction(id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setConfirmDeleteId(null);
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

      {credencialesIniciales.length > 0 && (
        <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Nombre</Th>
                <Th>Clave pública</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {credencialesIniciales.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                >
                  <td className="px-4 py-3 font-body text-sm text-text-primary">
                    {c.nombre}
                  </td>
                  <td className="px-4 py-3 font-body text-xs text-text-muted font-mono truncate max-w-[200px]">
                    {c.clavePublica.slice(0, 40)}…
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs text-state-error">
                          ¿Eliminar?
                        </span>
                        <Btn
                          onClick={() => handleEliminar(c.id)}
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
                      <Btn
                        onClick={() => setConfirmDeleteId(c.id)}
                        aria-label={`Eliminar ${c.nombre}`}
                      >
                        Eliminar
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {credencialesIniciales.length === 0 && !showAddForm && (
        <p className="font-body text-xs text-text-muted">
          Sin credenciales configuradas.
        </p>
      )}

      {showAddForm ? (
        <form
          onSubmit={handleCrear}
          className="flex flex-col gap-3 border border-border rounded-[var(--radius-md)] p-4"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cred-nombre"
              className="font-body text-xs text-text-muted"
            >
              Nombre
            </label>
            <input
              id="cred-nombre"
              type="text"
              placeholder="GitHub producción"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cred-publica"
              className="font-body text-xs text-text-muted"
            >
              Clave pública
            </label>
            <textarea
              id="cred-publica"
              rows={3}
              placeholder="ssh-rsa AAAA..."
              value={clavePublica}
              onChange={(e) => setClavePublica(e.target.value)}
              required
              className="font-body text-xs text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 font-mono resize-y"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="cred-privada"
              className="font-body text-xs text-text-muted"
            >
              Clave privada
            </label>
            <textarea
              id="cred-privada"
              rows={5}
              placeholder={"-----BEGIN RSA PRIVATE KEY-----\n..."}
              value={clavePrivada}
              onChange={(e) => setClavePrivada(e.target.value)}
              required
              className="font-body text-xs text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 font-mono resize-y"
            />
          </div>
          <div className="flex gap-2">
            <Btn primary disabled={loading} aria-label="Guardar credencial">
              {loading ? "…" : "Guardar"}
            </Btn>
            <Btn
              onClick={() => {
                setShowAddForm(false);
                setNombre("");
                setClavePublica("");
                setClavePrivada("");
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
          + Nueva credencial
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
