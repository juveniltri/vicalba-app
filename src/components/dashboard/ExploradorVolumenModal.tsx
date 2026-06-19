"use client";

import { useEffect, useRef, useState } from "react";

type Fichero = {
  nombre: string;
  tipo: "file" | "dir";
  tamaño: number | null;
  modificadoEn: string | null;
};

type Volumen = { id: string; nombre: string };

export function ExploradorVolumenModal({
  volumen,
  open,
  onClose,
}: {
  volumen: Volumen;
  open: boolean;
  onClose: () => void;
}) {
  const [ruta, setRuta] = useState("");
  const [ficheros, setFicheros] = useState<Fichero[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [draggingOver, setDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) cargarFicheros("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function cargarFicheros(subpath: string) {
    setLoading(true);
    setError(null);
    setSeleccionados(new Set());
    try {
      const url = `/api/volumes/${volumen.id}/files${subpath ? `?path=${encodeURIComponent(subpath)}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al cargar ficheros");
      setFicheros((await res.json()) as Fichero[]);
      setRuta(subpath);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCrearCarpeta() {
    if (!nombreCarpeta.trim()) return;
    try {
      const res = await fetch(`/api/volumes/${volumen.id}/files/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ruta, nombre: nombreCarpeta.trim() }),
      });
      if (!res.ok && res.status !== 409)
        throw new Error("Error al crear carpeta");
      setCreandoCarpeta(false);
      setNombreCarpeta("");
      await cargarFicheros(ruta);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleEliminar() {
    if (!confirm(`¿Eliminar ${seleccionados.size} elemento(s)?`)) return;
    for (const nombre of seleccionados) {
      const fullPath = ruta ? `${ruta}/${nombre}` : nombre;
      await fetch(
        `/api/volumes/${volumen.id}/files?path=${encodeURIComponent(fullPath)}`,
        { method: "DELETE" },
      );
    }
    await cargarFicheros(ruta);
  }

  async function handleSubir(files: FileList) {
    setUploading(true);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("file", f));
    const url = `/api/volumes/${volumen.id}/files${ruta ? `?path=${encodeURIComponent(ruta)}` : ""}`;
    try {
      await fetch(url, { method: "POST", body: form });
      await cargarFicheros(ruta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggleSeleccion(nombre: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  function toggleTodos() {
    if (seleccionados.size === ficheros.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(ficheros.map((f) => f.nombre)));
    }
  }

  const rutaParts = ruta ? ruta.split("/").filter(Boolean) : [];

  const downloadHref = (() => {
    if (!seleccionados.size) return "#";
    const params = new URLSearchParams();
    if (ruta) params.set("path", ruta);
    params.set("files", [...seleccionados].join(","));
    return `/api/volumes/${volumen.id}/files/download?${params}`;
  })();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[85vw] h-[85vh] bg-surface border border-border rounded-[var(--radius-md)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-display text-sm font-semibold text-text-primary">
            Explorador — {volumen.nombre}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar explorador"
            className="font-body text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-2">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 font-mono text-xs text-text-muted min-w-0">
            <button
              type="button"
              aria-label="Raíz"
              onClick={() => cargarFicheros("")}
              className="hover:text-text-primary shrink-0"
            >
              /
            </button>
            {rutaParts.map((part, i) => {
              const subpath = rutaParts.slice(0, i + 1).join("/");
              return (
                <span key={i} className="flex items-center gap-1 min-w-0">
                  <span className="shrink-0">/</span>
                  <button
                    type="button"
                    onClick={() => cargarFicheros(subpath)}
                    className="hover:text-text-primary truncate"
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Crear carpeta"
              onClick={() => setCreandoCarpeta(true)}
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors"
            >
              + Carpeta
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              id="modal-upload"
              aria-label="Subir ficheros"
              onChange={(e) => {
                if (e.target.files?.length) handleSubir(e.target.files);
                e.target.value = "";
              }}
            />
            <label
              htmlFor="modal-upload"
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 cursor-pointer transition-colors"
            >
              {uploading ? "Subiendo…" : "↑ Subir"}
            </label>
          </div>
        </div>

        {/* Inline create folder input */}
        {creandoCarpeta && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Nombre de la carpeta"
              value={nombreCarpeta}
              onChange={(e) => setNombreCarpeta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCrearCarpeta();
                if (e.key === "Escape") {
                  setCreandoCarpeta(false);
                  setNombreCarpeta("");
                }
              }}
              className="font-mono text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 flex-1"
            />
            <button
              type="button"
              onClick={handleCrearCarpeta}
              className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => {
                setCreandoCarpeta(false);
                setNombreCarpeta("");
              }}
              className="font-body text-xs text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="px-4 py-2 font-body text-xs text-state-error"
          >
            {error}
          </p>
        )}

        {/* File list */}
        <div
          className={`flex-1 overflow-y-auto ${draggingOver ? "bg-primary-500/10" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDraggingOver(true);
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDraggingOver(false);
            if (e.dataTransfer.files.length) handleSubir(e.dataTransfer.files);
          }}
        >
          {loading ? (
            <p className="px-4 py-3 font-body text-xs text-text-muted">
              Cargando…
            </p>
          ) : ficheros.length === 0 ? (
            <p className="px-4 py-3 font-body text-xs text-text-muted">
              Carpeta vacía.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar todos"
                      checked={
                        ficheros.length > 0 &&
                        seleccionados.size === ficheros.length
                      }
                      onChange={toggleTodos}
                    />
                  </th>
                  <th className="px-2 py-2 text-left font-body text-xs text-text-muted">
                    Nombre
                  </th>
                  <th className="px-2 py-2 text-left font-body text-xs text-text-muted hidden sm:table-cell">
                    Tamaño
                  </th>
                </tr>
              </thead>
              <tbody>
                {ficheros.map((f) => (
                  <tr
                    key={f.nombre}
                    className="border-b border-border last:border-0 hover:bg-elevated/50"
                  >
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={f.nombre}
                        checked={seleccionados.has(f.nombre)}
                        onChange={() => toggleSeleccion(f.nombre)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {f.tipo === "dir" ? (
                        <button
                          type="button"
                          onClick={() =>
                            cargarFicheros(
                              ruta ? `${ruta}/${f.nombre}` : f.nombre,
                            )
                          }
                          className="font-mono text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                        >
                          📁 {f.nombre}
                        </button>
                      ) : (
                        <span className="font-mono text-xs text-text-primary flex items-center gap-1">
                          📄 {f.nombre}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-body text-xs text-text-muted hidden sm:table-cell">
                      {f.tamaño !== null ? formatBytes(f.tamaño) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {seleccionados.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            <span className="font-body text-xs text-text-muted">
              {seleccionados.size}{" "}
              {seleccionados.size === 1 ? "seleccionado" : "seleccionados"}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={downloadHref}
                download
                aria-label="Descargar ZIP"
                className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors"
              >
                ↓ Descargar ZIP
              </a>
              <button
                type="button"
                onClick={handleEliminar}
                aria-label="Eliminar seleccionados"
                className="font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-state-error text-state-error hover:bg-state-error/10 transition-colors"
              >
                🗑 Eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
