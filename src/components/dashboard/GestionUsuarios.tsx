"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualizarUsuarioAction,
  cambiarPasswordAction,
  crearUsuarioAction,
  eliminarUsuarioAction,
} from "@/app/(panel)/actions";

type Usuario = {
  id: string;
  email: string;
  nombre: string;
  creadoEn: Date;
};

type Vista =
  | { tipo: "lista" }
  | { tipo: "nuevo" }
  | { tipo: "editar"; usuario: Usuario }
  | { tipo: "password"; usuario: Usuario };

export function GestionUsuarios({
  usuariosIniciales,
}: {
  usuariosIniciales: Usuario[];
}) {
  const router = useRouter();
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEliminar(id: string) {
    setLoading(true);
    setError(null);
    const result = await eliminarUsuarioAction(id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setConfirmDeleteId(null);
    router.refresh();
    setLoading(false);
  }

  if (vista.tipo === "nuevo") {
    return (
      <NuevoUsuarioForm
        onCancel={() => setVista({ tipo: "lista" })}
        onSuccess={() => {
          setVista({ tipo: "lista" });
          router.refresh();
        }}
      />
    );
  }

  if (vista.tipo === "editar") {
    return (
      <EditarUsuarioForm
        usuario={vista.usuario}
        onCancel={() => setVista({ tipo: "lista" })}
        onSuccess={() => {
          setVista({ tipo: "lista" });
          router.refresh();
        }}
      />
    );
  }

  if (vista.tipo === "password") {
    return (
      <CambiarPasswordForm
        usuario={vista.usuario}
        onCancel={() => setVista({ tipo: "lista" })}
        onSuccess={() => {
          setVista({ tipo: "lista" });
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      {usuariosIniciales.length > 0 && (
        <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Nombre</Th>
                <Th>Email</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {usuariosIniciales.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                >
                  <td className="px-4 py-3 font-body text-sm text-text-primary">
                    {u.nombre}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-text-muted">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === u.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs text-state-error">
                          ¿Eliminar?
                        </span>
                        <Btn
                          onClick={() => handleEliminar(u.id)}
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
                          onClick={() =>
                            setVista({ tipo: "editar", usuario: u })
                          }
                          aria-label={`Editar ${u.nombre}`}
                        >
                          Editar
                        </Btn>
                        <Btn
                          onClick={() =>
                            setVista({ tipo: "password", usuario: u })
                          }
                          aria-label={`Cambiar contraseña de ${u.nombre}`}
                        >
                          Contraseña
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(u.id)}
                          aria-label={`Eliminar ${u.nombre}`}
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

      {usuariosIniciales.length === 0 && (
        <p className="font-body text-xs text-text-muted">Sin usuarios.</p>
      )}

      <button
        type="button"
        onClick={() => setVista({ tipo: "nuevo" })}
        className="self-start font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors duration-[var(--duration-fast)]"
      >
        + Nuevo usuario
      </button>
    </div>
  );
}

function NuevoUsuarioForm({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await crearUsuarioAction(email, nombre, password);
    if (result && "error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    onSuccess();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 border border-border rounded-[var(--radius-md)] p-4"
    >
      <h2 className="font-display text-sm font-semibold text-text-primary">
        Nuevo usuario
      </h2>
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      <Field
        id="u-nombre"
        label="Nombre"
        value={nombre}
        onChange={setNombre}
        required
      />
      <Field
        id="u-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
      />
      <Field
        id="u-password"
        label="Contraseña"
        type="password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        placeholder="Mínimo 8 caracteres"
      />
      <div className="flex gap-2">
        <Btn primary disabled={loading} aria-label="Crear usuario">
          {loading ? "…" : "Crear"}
        </Btn>
        <Btn onClick={onCancel} aria-label="Cancelar">
          Cancelar
        </Btn>
      </div>
    </form>
  );
}

function EditarUsuarioForm({
  usuario,
  onCancel,
  onSuccess,
}: {
  usuario: Usuario;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [email, setEmail] = useState(usuario.email);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await actualizarUsuarioAction(usuario.id, nombre, email);
    if (result && "error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }
    onSuccess();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 border border-border rounded-[var(--radius-md)] p-4"
    >
      <h2 className="font-display text-sm font-semibold text-text-primary">
        Editar usuario
      </h2>
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      <Field
        id="eu-nombre"
        label="Nombre"
        value={nombre}
        onChange={setNombre}
        required
      />
      <Field
        id="eu-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        required
      />
      <div className="flex gap-2">
        <Btn primary disabled={loading} aria-label="Guardar cambios">
          {loading ? "…" : "Guardar"}
        </Btn>
        <Btn onClick={onCancel} aria-label="Cancelar">
          Cancelar
        </Btn>
      </div>
    </form>
  );
}

function CambiarPasswordForm({
  usuario,
  onCancel,
  onSuccess,
}: {
  usuario: Usuario;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await cambiarPasswordAction(usuario.id, password);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    onSuccess();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 border border-border rounded-[var(--radius-md)] p-4"
    >
      <h2 className="font-display text-sm font-semibold text-text-primary">
        Cambiar contraseña — {usuario.nombre}
      </h2>
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      <Field
        id="cp-password"
        label="Nueva contraseña"
        type="password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        placeholder="Mínimo 8 caracteres"
      />
      <div className="flex gap-2">
        <Btn primary disabled={loading} aria-label="Cambiar contraseña">
          {loading ? "…" : "Cambiar"}
        </Btn>
        <Btn onClick={onCancel} aria-label="Cancelar">
          Cancelar
        </Btn>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  required,
  minLength,
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-body text-xs text-text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
      />
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
