"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearProyectoAction,
  editarProyectoAction,
  eliminarProyectoAction,
} from "@/app/(panel)/actions";

type TipoProyecto = "compose" | "dockerfile" | "image" | "nodejs";

const TIPOS: { value: TipoProyecto; label: string }[] = [
  { value: "compose", label: "Docker Compose" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "image", label: "Docker Image" },
  { value: "nodejs", label: "Node.js" },
];

const USA_REPO: TipoProyecto[] = ["compose", "dockerfile", "nodejs"];

type ProyectoEditable = {
  id: string;
  nombre: string;
  dominio?: string | null;
  repositorioUrl?: string | null;
  rama: string;
  tipo?: TipoProyecto | null;
  puerto?: number | null;
  imagenUrl?: string | null;
  dockerfilePath?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
};

type ModalProps = {
  clienteId?: string;
  proyecto?: ProyectoEditable;
  onClose: () => void;
};

export function ProyectoFormModal({
  clienteId,
  proyecto,
  onClose,
}: ModalProps) {
  const router = useRouter();
  const isEdit = !!proyecto;
  const [nombre, setNombre] = useState(proyecto?.nombre ?? "");
  const [dominio, setDominio] = useState(proyecto?.dominio ?? "");
  const [tipo, setTipo] = useState<TipoProyecto>(proyecto?.tipo ?? "compose");
  const [repositorioUrl, setRepositorioUrl] = useState(
    proyecto?.repositorioUrl ?? "",
  );
  const [rama, setRama] = useState(proyecto?.rama ?? "main");
  const [dockerfilePath, setDockerfilePath] = useState(
    proyecto?.dockerfilePath ?? "",
  );
  const [imagenUrl, setImagenUrl] = useState(proyecto?.imagenUrl ?? "");
  const [buildCommand, setBuildCommand] = useState(
    proyecto?.buildCommand ?? "",
  );
  const [startCommand, setStartCommand] = useState(
    proyecto?.startCommand ?? "",
  );
  const [puerto, setPuerto] = useState(
    proyecto?.puerto != null ? String(proyecto.puerto) : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usaRepo = USA_REPO.includes(tipo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const dominioFinal = dominio.trim() || undefined;
    const puertoFinal = puerto.trim() ? parseInt(puerto, 10) : undefined;
    const repoFinal = usaRepo ? repositorioUrl.trim() || undefined : undefined;
    const imagenFinal =
      tipo === "image" ? imagenUrl.trim() || undefined : undefined;
    const dockerfilePathFinal =
      tipo === "dockerfile" ? dockerfilePath.trim() || undefined : undefined;
    const buildCommandFinal =
      tipo === "nodejs" ? buildCommand.trim() || undefined : undefined;
    const startCommandFinal =
      tipo === "nodejs" ? startCommand.trim() || undefined : undefined;

    const result = isEdit
      ? await editarProyectoAction(
          proyecto!.id,
          nombre,
          dominioFinal,
          repoFinal,
          rama,
          tipo,
          puertoFinal,
          imagenFinal,
          dockerfilePathFinal,
          buildCommandFinal,
          startCommandFinal,
        )
      : await crearProyectoAction(
          clienteId!,
          nombre,
          dominioFinal,
          repoFinal,
          rama,
          tipo,
          puertoFinal,
          imagenFinal,
          dockerfilePathFinal,
          buildCommandFinal,
          startCommandFinal,
        );
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-[var(--radius-md)] p-6 w-full max-w-md">
        <h2 className="font-display text-sm font-semibold text-text-primary mb-4">
          {isEdit ? "Editar proyecto" : "Nuevo proyecto"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="nombre"
              className="font-body text-xs text-text-muted"
            >
              Nombre
            </label>
            <input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: web-app"
              required
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tipo" className="font-body text-xs text-text-muted">
              Tipo
            </label>
            <select
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoProyecto)}
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary focus:outline-none focus:border-primary-300"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {tipo === "image" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="imagenUrl"
                className="font-body text-xs text-text-muted"
              >
                Imagen Docker
              </label>
              <input
                id="imagenUrl"
                type="text"
                value={imagenUrl}
                onChange={(e) => setImagenUrl(e.target.value)}
                placeholder="ej: nginx:latest"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          {usaRepo && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="repositorioUrl"
                className="font-body text-xs text-text-muted"
              >
                Repositorio GitHub (opcional)
              </label>
              <input
                id="repositorioUrl"
                type="url"
                value={repositorioUrl}
                onChange={(e) => setRepositorioUrl(e.target.value)}
                placeholder="ej: https://github.com/org/repo"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          {usaRepo && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="rama"
                className="font-body text-xs text-text-muted"
              >
                Rama
              </label>
              <input
                id="rama"
                type="text"
                value={rama}
                onChange={(e) => setRama(e.target.value)}
                placeholder="main"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          {tipo === "dockerfile" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="dockerfilePath"
                className="font-body text-xs text-text-muted"
              >
                Ruta del Dockerfile (opcional)
              </label>
              <input
                id="dockerfilePath"
                type="text"
                value={dockerfilePath}
                onChange={(e) => setDockerfilePath(e.target.value)}
                placeholder="Dockerfile"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          {tipo === "nodejs" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="buildCommand"
                className="font-body text-xs text-text-muted"
              >
                Build command (opcional — se lee de package.json si no se
                indica)
              </label>
              <input
                id="buildCommand"
                type="text"
                value={buildCommand}
                onChange={(e) => setBuildCommand(e.target.value)}
                placeholder="npm run build"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          {tipo === "nodejs" && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="startCommand"
                className="font-body text-xs text-text-muted"
              >
                Start command (opcional — se lee de package.json si no se
                indica)
              </label>
              <input
                id="startCommand"
                type="text"
                value={startCommand}
                onChange={(e) => setStartCommand(e.target.value)}
                placeholder="npm start"
                className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="dominio"
              className="font-body text-xs text-text-muted"
            >
              Dominio (opcional)
            </label>
            <input
              id="dominio"
              type="text"
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              placeholder="ej: app.micliente.com"
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="puerto"
              className="font-body text-xs text-text-muted"
            >
              Puerto expuesto (opcional, por defecto 80)
            </label>
            <input
              id="puerto"
              type="number"
              min={1}
              max={65535}
              value={puerto}
              onChange={(e) => setPuerto(e.target.value)}
              placeholder="ej: 3000"
              className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:border-primary-300"
            />
          </div>

          {error && (
            <p role="alert" className="font-body text-xs text-state-error">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-primary hover:border-primary-300 transition-opacity duration-[var(--duration-fast)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-primary-500 border border-primary-500 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity duration-[var(--duration-fast)]"
            >
              {loading ? "Guardando…" : isEdit ? "Guardar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditarProyectoButton({
  proyecto,
}: {
  proyecto: ProyectoEditable;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors duration-[var(--duration-fast)]"
      >
        Editar
      </button>
      {open && (
        <ProyectoFormModal proyecto={proyecto} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function EliminarProyectoButton({
  proyectoId,
  proyectoNombre,
}: {
  proyectoId: string;
  proyectoNombre: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEliminar() {
    setLoading(true);
    const result = await eliminarProyectoAction(proyectoId);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      setConfirm(false);
    } else {
      router.push("/proyectos");
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="font-body text-xs text-state-error">
          ¿Eliminar &quot;{proyectoNombre}&quot;?
        </span>
        <button
          onClick={handleEliminar}
          disabled={loading}
          className="font-display text-xs px-3 py-1.5 rounded-[var(--radius-md)] border border-state-error text-state-error hover:bg-state-error/10 disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="font-display text-xs px-3 py-1.5 rounded-[var(--radius-md)] border border-border text-text-muted hover:bg-elevated transition-colors"
        >
          Cancelar
        </button>
        {error && (
          <span className="font-body text-xs text-state-error">{error}</span>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="font-display text-xs px-3 py-1.5 rounded-[var(--radius-md)] border border-border text-text-muted hover:text-state-error hover:border-state-error transition-colors"
    >
      Eliminar proyecto
    </button>
  );
}
