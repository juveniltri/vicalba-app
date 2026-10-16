"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  copiarMiddlewaresAction,
  crearRutaAction,
  editarRutaAction,
  eliminarRutaAction,
  type DatosRuta,
} from "@/app/(panel)/actions";
import { SSLBadge } from "./SSLBadge";
import {
  aEntrada,
  aFormulario,
  FORM_MIDDLEWARES_VACIO,
  type FormMiddlewares,
  MiddlewaresCampos,
  type MiddlewaresVista,
  resumenMiddlewares,
} from "./MiddlewaresCampos";

type Redireccion = DatosRuta["redireccionWww"];

export type RutaPanel = {
  id: string;
  dominio: string;
  path: string;
  servicio: string | null;
  puerto: number;
  redireccionWww: Redireccion;
  middlewares: MiddlewaresVista;
  ssl: { activo: boolean; caducaEn: string | null };
};

type Formulario = {
  dominio: string;
  path: string;
  servicio: string;
  puerto: string;
  redireccionWww: Redireccion;
  mw: FormMiddlewares;
};

const VACIO: Formulario = {
  dominio: "",
  path: "",
  servicio: "",
  puerto: "",
  redireccionWww: "ninguna",
  mw: FORM_MIDDLEWARES_VACIO,
};

const raiz = (dominio: string) => dominio.replace(/^www\./, "");

function hostRedireccion(ruta: {
  dominio: string;
  redireccionWww: Redireccion;
}): string | null {
  if (ruta.redireccionWww === "a_raiz") return `www.${ruta.dominio}`;
  if (ruta.redireccionWww === "a_www") return raiz(ruta.dominio);
  return null;
}

export function DominiosPanel({
  proyectoId,
  esCompose,
  puertoProyecto,
  rutas,
  yaml,
  serviciosConocidos,
  serviciosEnMarcha,
}: {
  proyectoId: string;
  esCompose: boolean;
  puertoProyecto: number | null;
  rutas: RutaPanel[];
  yaml: string | null;
  serviciosConocidos: string[];
  // null when Docker couldn't be queried: then no route is flagged.
  serviciosEnMarcha: string[] | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | "nueva" | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const conAlias = new Set(
    rutas.flatMap((r) => (r.servicio ? [r.servicio] : [])),
  );

  function abrir(ruta?: RutaPanel) {
    setError(null);
    setAviso(null);
    setEditando(ruta?.id ?? "nueva");
    setForm(
      ruta
        ? {
            dominio: ruta.dominio,
            path: ruta.path,
            servicio: ruta.servicio ?? "",
            puerto: String(ruta.puerto),
            redireccionWww: ruta.redireccionWww,
            mw: aFormulario(ruta.middlewares),
          }
        : VACIO,
    );
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const servicio = esCompose ? form.servicio.trim() || null : null;
    const datos: DatosRuta = {
      dominio: form.dominio.trim(),
      path: form.path.trim(),
      servicio,
      puerto: form.puerto.trim() ? Number(form.puerto) : undefined,
      redireccionWww: form.redireccionWww,
      middlewares: aEntrada(form.mw),
    };
    const resultado =
      editando === "nueva"
        ? await crearRutaAction(proyectoId, datos)
        : await editarRutaAction(editando as string, datos);
    setCargando(false);
    if (resultado?.error) {
      setError(resultado.error);
      return;
    }
    setAviso(
      servicio && !conAlias.has(servicio)
        ? `La ruta a «${servicio}» funcionará tras el próximo deploy: el Servicio recibe su alias de red al desplegar.`
        : null,
    );
    setEditando(null);
    router.refresh();
  }

  async function copiarDe(desdeId: string) {
    setCargando(true);
    setError(null);
    const resultado = await copiarMiddlewaresAction(
      desdeId,
      editando as string,
    );
    setCargando(false);
    if (resultado?.error) {
      setError(resultado.error);
      return;
    }
    const origen = rutas.find((r) => r.id === desdeId);
    if (origen) setForm({ ...form, mw: aFormulario(origen.middlewares) });
    router.refresh();
  }

  async function eliminar(id: string) {
    setCargando(true);
    setError(null);
    const resultado = await eliminarRutaAction(id);
    setCargando(false);
    if (resultado?.error) {
      setError(resultado.error);
      return;
    }
    setConfirmarId(null);
    router.refresh();
  }

  const campo = (clave: Exclude<keyof Formulario, "mw">) => ({
    value: form[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [clave]: e.target.value }),
  });

  const conWww = form.dominio.trim().startsWith("www.");

  return (
    <div className="flex flex-col gap-3">
      <p className="font-body text-xs text-text-muted">
        Traefik enruta cada dominio (y path) al Servicio y puerto indicados, con
        su propio certificado. Los cambios se aplican al guardar, sin redeploy.
      </p>

      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="font-body text-xs text-state-deploying">
          {aviso}
        </p>
      )}

      {rutas.length > 0 && (
        <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Dominio</Th>
                <Th>Destino</Th>
                <Th>Certificado</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((r) => {
                const secundario = hostRedireccion(r);
                const sinContenedor =
                  !!r.servicio &&
                  serviciosEnMarcha !== null &&
                  !serviciosEnMarcha.includes(r.servicio);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                  >
                    <td className="px-4 py-3 align-top">
                      <a
                        href={`https://${r.dominio}${r.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-text-primary hover:underline"
                      >
                        {r.dominio}
                        {r.path && (
                          <span className="text-text-muted">{r.path}</span>
                        )}
                      </a>
                      {secundario && (
                        <p className="font-mono text-xs text-text-muted">
                          {secundario} → {r.dominio}
                        </p>
                      )}
                      {resumenMiddlewares(r.middlewares).length > 0 && (
                        <ul
                          aria-label={`Protección de ${r.dominio}${r.path}`}
                          className="flex flex-wrap gap-1 mt-1"
                        >
                          {resumenMiddlewares(r.middlewares).map((t) => (
                            <li
                              key={t}
                              className="font-body text-[11px] px-1.5 rounded-[var(--radius-sm)] border border-border text-text-secondary"
                            >
                              {t}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-text-secondary">
                      {r.servicio ?? "principal"}:{r.puerto}
                      {sinContenedor && (
                        <p className="font-body text-xs text-state-error">
                          ⚠ Servicio no encontrado
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <SSLBadge estado={r.ssl} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      {confirmarId === r.id ? (
                        <div className="flex items-center gap-2">
                          <span className="font-body text-xs text-state-error">
                            ¿Eliminar?
                          </span>
                          <Btn
                            onClick={() => eliminar(r.id)}
                            disabled={cargando}
                            aria-label={`Confirmar eliminación de ${r.dominio}`}
                          >
                            Confirmar
                          </Btn>
                          <Btn onClick={() => setConfirmarId(null)}>
                            Cancelar
                          </Btn>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Btn
                            onClick={() => abrir(r)}
                            aria-label={`Editar ${r.dominio}${r.path}`}
                          >
                            Editar
                          </Btn>
                          <Btn
                            onClick={() => setConfirmarId(r.id)}
                            aria-label={`Eliminar ${r.dominio}${r.path}`}
                          >
                            Eliminar
                          </Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rutas.length === 0 && editando === null && (
        <p className="font-body text-xs text-text-muted">
          Sin dominios: el Proyecto no es accesible desde fuera de la VPS.
        </p>
      )}

      {editando !== null ? (
        <form
          onSubmit={guardar}
          aria-label={editando === "nueva" ? "Nuevo dominio" : "Editar dominio"}
          className="grid gap-3 sm:grid-cols-2 border border-border rounded-[var(--radius-md)] p-4"
        >
          <Campo id="ruta-dominio" etiqueta="Dominio">
            <input
              id="ruta-dominio"
              type="text"
              required
              placeholder="app.cliente.com"
              {...campo("dominio")}
              className={claseInput}
            />
          </Campo>
          <Campo id="ruta-path" etiqueta="Path (opcional)">
            <input
              id="ruta-path"
              type="text"
              placeholder="/api"
              {...campo("path")}
              className={claseInput}
            />
          </Campo>
          {esCompose && (
            <Campo
              id="ruta-servicio"
              etiqueta="Servicio (vacío = el principal)"
            >
              <input
                id="ruta-servicio"
                type="text"
                list="ruta-servicios"
                placeholder={serviciosConocidos[0] ?? "web"}
                {...campo("servicio")}
                className={claseInput}
              />
              <datalist id="ruta-servicios">
                {serviciosConocidos.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Campo>
          )}
          <Campo id="ruta-puerto" etiqueta="Puerto del contenedor">
            <input
              id="ruta-puerto"
              type="number"
              min={1}
              max={65535}
              placeholder={String(puertoProyecto ?? 80)}
              {...campo("puerto")}
              className={claseInput}
            />
          </Campo>
          <Campo id="ruta-www" etiqueta="Redirección www">
            <select
              id="ruta-www"
              {...campo("redireccionWww")}
              className={claseInput}
            >
              <option value="ninguna">Sin redirección</option>
              {form.dominio.trim() &&
                (conWww ? (
                  <option value="a_www">
                    {raiz(form.dominio.trim())} → {form.dominio.trim()}
                  </option>
                ) : (
                  <option value="a_raiz">
                    www.{form.dominio.trim()} → {form.dominio.trim()}
                  </option>
                ))}
            </select>
          </Campo>
          <MiddlewaresCampos
            valor={form.mw}
            onChange={(mw) => setForm({ ...form, mw })}
            conPath={!!form.path.trim()}
          />
          {editando !== "nueva" && rutas.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <label
                htmlFor="ruta-copiar"
                className="font-body text-xs text-text-muted"
              >
                Copiar protección de
              </label>
              <select
                id="ruta-copiar"
                defaultValue=""
                disabled={cargando}
                onChange={(e) => e.target.value && copiarDe(e.target.value)}
                className={`${claseInput} sm:w-auto`}
              >
                <option value="">—</option>
                {rutas
                  .filter((r) => r.id !== editando)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.dominio}
                      {r.path}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Btn primary disabled={cargando}>
              {cargando ? "Guardando…" : "Guardar"}
            </Btn>
            <Btn onClick={() => setEditando(null)}>Cancelar</Btn>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => abrir()}
          className="self-start font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors duration-[var(--duration-fast)]"
        >
          + Nuevo dominio
        </button>
      )}

      {yaml && (
        <details className="border border-border rounded-[var(--radius-md)]">
          <summary className="cursor-pointer px-4 py-2 font-body text-xs text-text-muted hover:text-text-primary">
            Ver YAML generado para Traefik
          </summary>
          <pre className="overflow-x-auto px-4 pb-4 font-mono text-xs text-text-secondary">
            {yaml}
          </pre>
        </details>
      )}
    </div>
  );
}

const claseInput =
  "font-mono text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full";

function Campo({
  id,
  etiqueta,
  children,
}: {
  id: string;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-body text-xs text-text-muted">
        {etiqueta}
      </label>
      {children}
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
