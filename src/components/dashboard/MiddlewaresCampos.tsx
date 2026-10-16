"use client";

import { useState } from "react";
import type {
  Middlewares,
  MiddlewaresEntrada,
} from "@/lib/schemas/middlewares";

// What the Panel receives: basic auth users without their hashes.
export type MiddlewaresVista = Omit<Middlewares, "basicAuth"> & {
  basicAuth?: { usuarios: { usuario: string }[] };
};

type Politica = NonNullable<
  NonNullable<Middlewares["cabeceras"]>["referrerPolicy"]
>;

export type FormMiddlewares = {
  ips: string;
  usuarios: { usuario: string; contrasena: string; existente: boolean }[];
  media: string;
  rafaga: string;
  bodyMB: string;
  hsts: boolean;
  nosniff: boolean;
  frameDeny: boolean;
  referrerPolicy: Politica | "";
  cabecerasPropias: string;
  compresion: boolean;
  quitarPrefijo: boolean;
};

export const FORM_MIDDLEWARES_VACIO: FormMiddlewares = {
  ips: "",
  usuarios: [],
  media: "",
  rafaga: "",
  bodyMB: "",
  hsts: false,
  nosniff: false,
  frameDeny: false,
  referrerPolicy: "",
  cabecerasPropias: "",
  compresion: false,
  quitarPrefijo: false,
};

export function aFormulario(m: MiddlewaresVista): FormMiddlewares {
  const c = m.cabeceras ?? {};
  return {
    ips: (m.ipPermitidas ?? []).join("\n"),
    usuarios: (m.basicAuth?.usuarios ?? []).map(({ usuario }) => ({
      usuario,
      contrasena: "",
      existente: true,
    })),
    media: m.limitePeticiones ? String(m.limitePeticiones.media) : "",
    rafaga: m.limitePeticiones ? String(m.limitePeticiones.rafaga) : "",
    bodyMB: m.bodyMaximoMB ? String(m.bodyMaximoMB) : "",
    hsts: !!c.hsts,
    nosniff: !!c.nosniff,
    frameDeny: !!c.frameDeny,
    referrerPolicy: c.referrerPolicy ?? "",
    cabecerasPropias: Object.entries(c.propias ?? {})
      .map(([nombre, valor]) => `${nombre}: ${valor}`)
      .join("\n"),
    compresion: !!m.compresion,
    quitarPrefijo: !!m.quitarPrefijo,
  };
}

export function aEntrada(f: FormMiddlewares): MiddlewaresEntrada {
  const ips = f.ips.split(/[\s,]+/).filter(Boolean);
  const usuarios = f.usuarios
    .filter((u) => u.usuario.trim())
    .map((u) => ({
      usuario: u.usuario.trim(),
      ...(u.contrasena && { contrasena: u.contrasena }),
    }));
  const propias = Object.fromEntries(
    f.cabecerasPropias
      .split("\n")
      .map((l) => {
        const i = l.indexOf(":");
        return i < 0
          ? [l.trim(), ""]
          : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
      .filter(([nombre]) => nombre),
  );
  const media = Number(f.media);
  const hayCabeceras =
    f.hsts ||
    f.nosniff ||
    f.frameDeny ||
    !!f.referrerPolicy ||
    Object.keys(propias).length > 0;
  return {
    ...(ips.length > 0 && { ipPermitidas: ips }),
    ...(usuarios.length > 0 && { basicAuth: { usuarios } }),
    ...(media > 0 && {
      limitePeticiones: { media, rafaga: Number(f.rafaga) || media },
    }),
    ...(Number(f.bodyMB) > 0 && { bodyMaximoMB: Number(f.bodyMB) }),
    ...(hayCabeceras && {
      cabeceras: {
        ...(f.hsts && { hsts: true }),
        ...(f.nosniff && { nosniff: true }),
        ...(f.frameDeny && { frameDeny: true }),
        ...(f.referrerPolicy && { referrerPolicy: f.referrerPolicy }),
        ...(Object.keys(propias).length > 0 && { propias }),
      },
    }),
    ...(f.compresion && { compresion: true }),
    ...(f.quitarPrefijo && { quitarPrefijo: true }),
  };
}

export function resumenMiddlewares(m: MiddlewaresVista): string[] {
  return [
    m.basicAuth && `Contraseña (${m.basicAuth.usuarios.length})`,
    m.ipPermitidas && `IPs (${m.ipPermitidas.length})`,
    m.limitePeticiones && `${m.limitePeticiones.media} pet./s`,
    m.bodyMaximoMB && `Body ≤ ${m.bodyMaximoMB} MB`,
    m.cabeceras && "Cabeceras",
    m.compresion && "Compresión",
    m.quitarPrefijo && "Sin prefijo",
  ].filter((t): t is string => !!t);
}

const claseInput =
  "font-mono text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 w-full";

export function MiddlewaresCampos({
  valor,
  onChange,
  conPath,
}: {
  valor: FormMiddlewares;
  onChange: (valor: FormMiddlewares) => void;
  conPath: boolean;
}) {
  const set = <K extends keyof FormMiddlewares>(
    clave: K,
    v: FormMiddlewares[K],
  ) => onChange({ ...valor, [clave]: v });
  const usuario = (
    i: number,
    cambio: Partial<FormMiddlewares["usuarios"][number]>,
  ) =>
    set(
      "usuarios",
      valor.usuarios.map((u, j) => (j === i ? { ...u, ...cambio } : u)),
    );
  // Only the initial state: re-deriving it on every keystroke would close the
  // section while the user is still filling it in.
  const [abierto] = useState(
    () => resumenMiddlewares(aEntrada(valor) as MiddlewaresVista).length > 0,
  );

  return (
    <details
      open={abierto}
      className="sm:col-span-2 border border-border rounded-[var(--radius-md)]"
    >
      <summary className="cursor-pointer px-3 py-2 font-body text-xs text-text-muted hover:text-text-primary">
        Protección y cabeceras
      </summary>
      <div className="grid gap-4 sm:grid-cols-2 px-3 pb-3">
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="font-body text-xs text-text-secondary">
            Autenticación básica
          </legend>
          {valor.usuarios.map((u, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Usuario ${i + 1}`}
                value={u.usuario}
                readOnly={u.existente}
                onChange={(e) => usuario(i, { usuario: e.target.value })}
                placeholder="usuario"
                className={`${claseInput} sm:w-40`}
              />
              <input
                aria-label={`Contraseña de ${u.usuario || `usuario ${i + 1}`}`}
                type="password"
                autoComplete="new-password"
                value={u.contrasena}
                onChange={(e) => usuario(i, { contrasena: e.target.value })}
                placeholder={
                  u.existente ? "(sin cambios)" : "mínimo 8 caracteres"
                }
                className={`${claseInput} sm:w-56`}
              />
              <button
                type="button"
                onClick={() =>
                  set(
                    "usuarios",
                    valor.usuarios.filter((_, j) => j !== i),
                  )
                }
                aria-label={`Quitar ${u.usuario || `usuario ${i + 1}`}`}
                className="font-body text-xs text-text-muted hover:text-state-error"
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set("usuarios", [
                ...valor.usuarios,
                { usuario: "", contrasena: "", existente: false },
              ])
            }
            className="self-start font-body text-xs text-text-muted hover:text-text-primary"
          >
            + Añadir usuario
          </button>
        </fieldset>

        <Campo id="mw-ips" etiqueta="IPs o rangos permitidos (uno por línea)">
          <textarea
            id="mw-ips"
            rows={2}
            value={valor.ips}
            onChange={(e) => set("ips", e.target.value)}
            placeholder={"203.0.113.7\n10.0.0.0/8"}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo id="mw-media" etiqueta="Peticiones/s por IP">
            <input
              id="mw-media"
              type="number"
              min={1}
              value={valor.media}
              onChange={(e) => set("media", e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo id="mw-rafaga" etiqueta="Ráfaga">
            <input
              id="mw-rafaga"
              type="number"
              min={1}
              value={valor.rafaga}
              onChange={(e) => set("rafaga", e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        <Campo id="mw-body" etiqueta="Tamaño máximo de la petición (MB)">
          <input
            id="mw-body"
            type="number"
            min={1}
            value={valor.bodyMB}
            onChange={(e) => set("bodyMB", e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo id="mw-referrer" etiqueta="Referrer-Policy">
          <select
            id="mw-referrer"
            value={valor.referrerPolicy}
            onChange={(e) =>
              set(
                "referrerPolicy",
                e.target.value as FormMiddlewares["referrerPolicy"],
              )
            }
            className={claseInput}
          >
            <option value="">La de la aplicación</option>
            <option value="strict-origin-when-cross-origin">
              strict-origin-when-cross-origin
            </option>
            <option value="strict-origin">strict-origin</option>
            <option value="same-origin">same-origin</option>
            <option value="no-referrer">no-referrer</option>
          </select>
        </Campo>
        <Campo
          id="mw-propias"
          etiqueta="Cabeceras propias (Nombre: valor, una por línea)"
        >
          <textarea
            id="mw-propias"
            rows={2}
            value={valor.cabecerasPropias}
            onChange={(e) => set("cabecerasPropias", e.target.value)}
            placeholder="X-Robots-Tag: noindex"
            className={claseInput}
          />
        </Campo>
        <div className="flex flex-col gap-1.5 font-body text-xs text-text-secondary">
          <Casilla
            etiqueta="HSTS (forzar HTTPS en el navegador un año)"
            marcada={valor.hsts}
            onChange={(v) => set("hsts", v)}
          />
          <Casilla
            etiqueta="X-Content-Type-Options: nosniff"
            marcada={valor.nosniff}
            onChange={(v) => set("nosniff", v)}
          />
          <Casilla
            etiqueta="No permitir el sitio dentro de iframes"
            marcada={valor.frameDeny}
            onChange={(v) => set("frameDeny", v)}
          />
          <Casilla
            etiqueta="Compresión gzip/brotli"
            marcada={valor.compresion}
            onChange={(v) => set("compresion", v)}
          />
          {conPath && (
            <Casilla
              etiqueta="Quitar el path antes de pasar la petición al Servicio"
              marcada={valor.quitarPrefijo}
              onChange={(v) => set("quitarPrefijo", v)}
            />
          )}
        </div>
      </div>
    </details>
  );
}

function Casilla({
  etiqueta,
  marcada,
  onChange,
}: {
  etiqueta: string;
  marcada: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onChange(e.target.checked)}
      />
      {etiqueta}
    </label>
  );
}

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
