"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearVolumenAction,
  eliminarVolumenAction,
} from "@/app/(panel)/actions";

type Volumen = {
  id: string;
  nombre: string;
  rutaContenedor: string;
  creadoEn: Date;
};

type Fichero = {
  nombre: string;
  tipo: "file" | "dir";
  tamaño: number | null;
  modificadoEn: string | null;
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
  const [explorandoId, setExplorandoId] = useState<string | null>(null);
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
    if (explorandoId === id) setExplorandoId(null);
    router.refresh();
    setLoading(false);
  }

  const explorandoVolumen = volumenesIniciales.find(
    (v) => v.id === explorandoId,
  );

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
                          onClick={() =>
                            setExplorandoId(explorandoId === v.id ? null : v.id)
                          }
                          aria-label={`Explorar ficheros de ${v.nombre}`}
                        >
                          {explorandoId === v.id ? "Cerrar" : "Ficheros"}
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

      {explorandoVolumen && (
        <FileManager
          volumenId={explorandoVolumen.id}
          nombre={explorandoVolumen.nombre}
        />
      )}

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

function FileManager({
  volumenId,
  nombre,
}: {
  volumenId: string;
  nombre: string;
}) {
  const [ficheros, setFicheros] = useState<Fichero[]>([]);
  const [ruta, setRuta] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function cargarFicheros(subpath = "") {
    setLoadingFiles(true);
    setError(null);
    try {
      const url = `/api/volumes/${volumenId}/files${subpath ? `?path=${encodeURIComponent(subpath)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar ficheros");
      setFicheros((await res.json()) as Fichero[]);
      setRuta(subpath);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleSubir(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("file", f));
    const url = `/api/volumes/${volumenId}/files${ruta ? `?path=${encodeURIComponent(ruta)}` : ""}`;
    try {
      const res = await fetch(url, { method: "POST", body: form });
      if (!res.ok) throw new Error("Error al subir fichero");
      await cargarFicheros(ruta);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleEliminar(fichero: Fichero) {
    const fullPath = ruta ? `${ruta}/${fichero.nombre}` : fichero.nombre;
    setError(null);
    try {
      const res = await fetch(
        `/api/volumes/${volumenId}/files?path=${encodeURIComponent(fullPath)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Error al eliminar fichero");
      await cargarFicheros(ruta);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const rutaParts = ruta ? ruta.split("/").filter(Boolean) : [];

  return (
    <div className="border border-primary-300/40 rounded-[var(--radius-md)] p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs font-semibold text-text-primary">
          Ficheros — {nombre}
        </span>
        {ficheros.length === 0 && !loadingFiles && (
          <button
            type="button"
            onClick={() => cargarFicheros("")}
            className="font-body text-xs text-primary-400 hover:text-primary-300"
          >
            Cargar
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      {/* Breadcrumb */}
      {ficheros.length > 0 || loadingFiles ? (
        <div className="flex items-center gap-1 font-mono text-xs text-text-muted">
          <button
            type="button"
            onClick={() => cargarFicheros("")}
            className="hover:text-text-primary"
          >
            /
          </button>
          {rutaParts.map((part, i) => {
            const subpath = rutaParts.slice(0, i + 1).join("/");
            return (
              <span key={i} className="flex items-center gap-1">
                <span>/</span>
                <button
                  type="button"
                  onClick={() => cargarFicheros(subpath)}
                  className="hover:text-text-primary"
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* File list */}
      {loadingFiles ? (
        <p className="font-body text-xs text-text-muted">Cargando…</p>
      ) : ficheros.length === 0 && ruta !== "" ? (
        <p className="font-body text-xs text-text-muted">Carpeta vacía.</p>
      ) : ficheros.length > 0 ? (
        <div className="flex flex-col divide-y divide-border">
          {ficheros.map((f) => (
            <div
              key={f.nombre}
              className="flex items-center justify-between py-1.5"
            >
              <button
                type="button"
                disabled={f.tipo !== "dir"}
                onClick={() =>
                  f.tipo === "dir" &&
                  cargarFicheros(ruta ? `${ruta}/${f.nombre}` : f.nombre)
                }
                className={`font-mono text-xs flex items-center gap-1 ${
                  f.tipo === "dir"
                    ? "text-primary-400 hover:text-primary-300 cursor-pointer"
                    : "text-text-primary cursor-default"
                }`}
              >
                {f.tipo === "dir" ? "📁" : "📄"} {f.nombre}
                {f.tamaño !== null && (
                  <span className="text-text-muted ml-2">
                    {formatBytes(f.tamaño)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleEliminar(f)}
                className="font-body text-xs text-text-muted hover:text-state-error"
                aria-label={`Eliminar ${f.nombre}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Upload */}
      {(ficheros.length > 0 || ruta !== "") && (
        <div className="flex items-center gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleSubir}
            className="hidden"
            id={`upload-${volumenId}`}
            aria-label="Subir ficheros"
          />
          <label
            htmlFor={`upload-${volumenId}`}
            className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 cursor-pointer transition-colors"
          >
            {uploading ? "Subiendo…" : "↑ Subir ficheros"}
          </label>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
