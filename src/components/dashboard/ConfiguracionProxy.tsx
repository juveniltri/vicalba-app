"use client";

import { useEffect, useState, useTransition } from "react";
import {
  aplicarProxyAction,
  logProxyAction,
  obtenerProxyAction,
  rangosCloudflareAction,
} from "@/app/(panel)/actions";
import type { ConfiguracionProxy as Config } from "@/lib/schemas/proxy";

export type EstadoProxy = {
  aplicada: Config;
  pendiente: Config | null;
  estado: "aplicada" | "en_curso" | "revertida" | "error";
  mensaje: string | null;
  log: string | null;
  hayTokenCloudflare: boolean;
};

type Formulario = {
  ips: string;
  lectura: string;
  escritura: string;
  inactividad: string;
  logNivel: Config["logNivel"];
  accessLog: boolean;
  tlsMinima: Config["tlsMinima"];
  cfDelante: boolean;
  cfRangos: string;
  // "" keeps the stored token
  cfToken: string;
  cfQuitarToken: boolean;
};

const aFormulario = (c: Config): Formulario => ({
  ips: c.ipsConfianza.join("\n"),
  lectura: String(c.timeouts.lecturaSeg),
  escritura: String(c.timeouts.escrituraSeg),
  inactividad: String(c.timeouts.inactividadSeg),
  logNivel: c.logNivel,
  accessLog: c.accessLog,
  tlsMinima: c.tlsMinima,
  cfDelante: c.cloudflare.delante,
  cfRangos: c.cloudflare.rangos.join("\n"),
  cfToken: "",
  cfQuitarToken: false,
});

const lineas = (texto: string) => texto.split(/[\s,]+/).filter(Boolean);

const aConfig = (f: Formulario): Config => ({
  ipsConfianza: lineas(f.ips),
  timeouts: {
    lecturaSeg: Number(f.lectura),
    escrituraSeg: Number(f.escritura),
    inactividadSeg: Number(f.inactividad),
  },
  logNivel: f.logNivel,
  accessLog: f.accessLog,
  tlsMinima: f.tlsMinima,
  cloudflare: { delante: f.cfDelante, rangos: lineas(f.cfRangos) },
});

const tokenEnviado = (f: Formulario) =>
  f.cfQuitarToken ? null : f.cfToken.trim() || undefined;

const claseInput =
  "min-h-10 w-full px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]";

export const INTERVALO_CONSULTA_MS = 2000;

export function ConfiguracionProxy({ inicial }: { inicial: EstadoProxy }) {
  const [estado, setEstado] = useState(inicial);
  const [form, setForm] = useState(aFormulario(inicial.aplicada));
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const enCurso = estado.estado === "en_curso";

  // While Traefik restarts this very request may fail: keep asking.
  useEffect(() => {
    if (!enCurso) return;
    const id = setInterval(async () => {
      const r = await obtenerProxyAction().catch(() => null);
      if (r && !("error" in r) && r.estado !== "en_curso") {
        setEstado(r);
        if (r.estado === "aplicada") setForm(aFormulario(r.aplicada));
      }
    }, INTERVALO_CONSULTA_MS);
    return () => clearInterval(id);
  }, [enCurso]);

  const aplicar = () => {
    setConfirmando(false);
    setError(null);
    startTransition(async () => {
      const token = tokenEnviado(form);
      const r = await aplicarProxyAction(aConfig(form), token);
      if ("error" in r) setError(r.error);
      else {
        setEstado({
          ...estado,
          estado: "en_curso",
          mensaje: null,
          log: null,
          hayTokenCloudflare:
            token === undefined ? estado.hayTokenCloudflare : token !== null,
        });
        setForm({ ...form, cfToken: "", cfQuitarToken: false });
      }
    });
  };

  const actualizarRangos = () =>
    startTransition(async () => {
      setError(null);
      const r = await rangosCloudflareAction();
      if (r.rangos) setForm({ ...form, cfRangos: r.rangos.join("\n") });
      else setError(r.error ?? "No se pudo descargar la lista de Cloudflare");
    });

  const verLog = () =>
    startTransition(async () => setLog(await logProxyAction()));

  const set = <K extends keyof Formulario>(k: K, v: Formulario[K]) =>
    setForm({ ...form, [k]: v });

  return (
    <div className="flex flex-col gap-4">
      {enCurso && (
        <p
          role="status"
          className="px-3 py-2 rounded-[var(--radius-md)] border border-deploying-border bg-deploying-bg font-body text-xs text-deploying-text"
        >
          Aplicando… Traefik se está reiniciando: el Panel puede dejar de
          responder unos segundos.
        </p>
      )}
      {(estado.estado === "revertida" || estado.estado === "error") && (
        <div
          role="alert"
          className="flex flex-col gap-2 px-3 py-2 rounded-[var(--radius-md)] border border-error-border bg-error-bg font-body text-xs text-error-text"
        >
          <p>{estado.mensaje}</p>
          {estado.log && (
            <details>
              <summary className="cursor-pointer">Log de Traefik</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono">
                {estado.log}
              </pre>
            </details>
          )}
          {estado.pendiente && (
            <button
              type="button"
              onClick={() => setForm(aFormulario(estado.pendiente!))}
              className="self-start underline"
            >
              Cargar en el formulario la configuración que no se aplicó
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label
            htmlFor="proxy-ips"
            className="font-body text-xs text-text-muted"
          >
            IPs de confianza (proxies delante de Traefik, uno por línea)
          </label>
          <textarea
            id="proxy-ips"
            rows={3}
            value={form.ips}
            onChange={(e) => set("ips", e.target.value)}
            placeholder="ej: 173.245.48.0/20"
            className={`${claseInput} py-2 font-mono`}
          />
          <p className="font-body text-xs text-text-muted">
            Solo se fían las cabeceras X-Forwarded-* que llegan desde estas IPs.
            Vacío: Traefik es la entrada y pone él la IP real del visitante.
          </p>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-body text-xs text-text-muted">
            Timeouts en segundos (0 = sin límite)
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["lectura", "Lectura"],
                ["escritura", "Escritura"],
                ["inactividad", "Inactividad"],
              ] as const
            ).map(([k, etiqueta]) => (
              <label
                key={k}
                className="flex flex-col gap-1 font-body text-xs text-text-muted"
              >
                {etiqueta}
                <input
                  type="number"
                  min={0}
                  value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                  className={claseInput}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 font-body text-xs text-text-muted">
            Nivel de log
            <select
              value={form.logNivel}
              onChange={(e) =>
                set("logNivel", e.target.value as Config["logNivel"])
              }
              className={claseInput}
            >
              {(["ERROR", "WARN", "INFO", "DEBUG"] as const).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-body text-xs text-text-muted">
            TLS mínimo
            <select
              value={form.tlsMinima}
              onChange={(e) =>
                set("tlsMinima", e.target.value as Config["tlsMinima"])
              }
              className={claseInput}
            >
              <option value="VersionTLS12">TLS 1.2</option>
              <option value="VersionTLS13">TLS 1.3</option>
            </select>
          </label>
        </div>
        <label className="inline-flex items-center gap-2 font-body text-xs text-text-secondary sm:col-span-2">
          <input
            type="checkbox"
            checked={form.accessLog}
            onChange={(e) => set("accessLog", e.target.checked)}
          />
          Access log (una línea JSON por petición en el log de Traefik; con
          mucho tráfico tapa los errores, actívalo solo para depurar)
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 border-t border-border pt-3">
        <legend className="font-body text-xs font-semibold text-text-secondary">
          Cloudflare
        </legend>
        <label className="inline-flex items-center gap-2 font-body text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={form.cfDelante}
            onChange={(e) => set("cfDelante", e.target.checked)}
          />
          Hay dominios detrás del proxy de Cloudflare (nube naranja): confiar en
          sus rangos para la IP real del visitante
        </label>
        <details className="font-body text-xs text-text-muted">
          <summary className="cursor-pointer">
            Rangos de Cloudflare ({lineas(form.cfRangos).length})
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            <textarea
              aria-label="Rangos de Cloudflare"
              rows={6}
              value={form.cfRangos}
              onChange={(e) => set("cfRangos", e.target.value)}
              className={`${claseInput} py-2 font-mono`}
            />
            <button
              type="button"
              onClick={actualizarRangos}
              disabled={enviando}
              className="self-start underline hover:text-text-primary disabled:opacity-50"
            >
              Actualizar desde cloudflare.com
            </button>
          </div>
        </details>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="proxy-cf-token"
            className="font-body text-xs text-text-muted"
          >
            Token de la API de Cloudflare (permiso Zone → DNS → Edit)
          </label>
          <input
            id="proxy-cf-token"
            type="password"
            autoComplete="off"
            value={form.cfToken}
            disabled={form.cfQuitarToken}
            onChange={(e) => set("cfToken", e.target.value)}
            placeholder={
              estado.hayTokenCloudflare
                ? "(guardado; escribe otro para cambiarlo)"
                : "sin token"
            }
            className={`${claseInput} font-mono`}
          />
          {estado.hayTokenCloudflare && (
            <label className="inline-flex items-center gap-2 font-body text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={form.cfQuitarToken}
                onChange={(e) => set("cfQuitarToken", e.target.checked)}
              />
              Quitar el token
            </label>
          )}
          <p className="font-body text-xs text-text-muted">
            Con token, las rutas detrás de Cloudflare obtienen el certificado
            por DNS; sin él, por HTTP. En Cloudflare, el modo SSL debe ser «Full
            (strict)».
          </p>
        </div>
      </fieldset>

      {confirmando ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-xs text-text-secondary">
            Traefik se reiniciará: se cortan las conexiones unos segundos. Si no
            arranca, se vuelve solo a la configuración actual.
          </span>
          <button
            type="button"
            onClick={aplicar}
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)]"
          >
            Aplicar y reiniciar
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={enCurso || enviando}
          className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {enCurso ? "Aplicando…" : "Aplicar"}
        </button>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <p className="font-body text-xs text-text-muted">
          Fijo: entrada HTTP :80 redirigida a HTTPS :443, certificados de
          Let&apos;s Encrypt (desafío TLS) y ping interno en :8082. Acceso de
          emergencia al Panel: <code>ssh -L 3000:localhost:3000</code> a la VPS.
        </p>
        <button
          type="button"
          onClick={verLog}
          disabled={enviando}
          className="self-start font-body text-xs text-text-muted hover:text-text-primary underline disabled:opacity-50"
        >
          Ver las últimas líneas del log de Traefik
        </button>
        {log !== null && (
          <pre
            aria-label="Log de Traefik"
            className="max-h-80 overflow-auto px-3 py-2 rounded-[var(--radius-md)] bg-terminal font-mono text-xs text-terminal-text whitespace-pre-wrap break-all"
          >
            {log || "(vacío)"}
          </pre>
        )}
      </div>
    </div>
  );
}
