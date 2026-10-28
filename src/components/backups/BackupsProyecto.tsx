"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cancelarBackupAction,
  copiarProyectoBackupAction,
  habilitarProyectoBackupAction,
  marcarElementoBackupAction,
  restaurarProyectoBackupAction,
} from "@/app/(panel)/actions";
import { DeployPoller } from "@/components/dashboard/DeployPoller";
import { ProjectActionButton } from "@/components/dashboard/ProjectActionButton";
import { useToast } from "@/components/ui/Toast";
import type {
  BackupsProyectoVista,
  CopiaProyecto,
} from "@/lib/schemas/dashboard";
import { formatearBytes, formatearFecha } from "./HistorialBackups";

const botonSecundario =
  "inline-flex items-center min-h-8 px-3 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated disabled:opacity-50 disabled:pointer-events-none";
const botonPrimario =
  "inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:pointer-events-none";

const ORIGEN = {
  programado: "Programada",
  manual: "Manual",
  antes_de_restaurar: "Antes de restaurar",
} as const;
const RESULTADO = {
  exito: "correcta",
  error: "con error",
  en_curso: "en curso",
} as const;

export function BotonCancelarBackup() {
  const router = useRouter();
  return (
    <ProjectActionButton
      action={async () => {
        const result = await cancelarBackupAction();
        router.refresh();
        return result;
      }}
      label="Cancelar"
      confirmLabel="¿Cancelar la operación?"
      pendingLabel="Cancelando…"
      successMessage="Operación cancelada"
      className={botonSecundario}
    />
  );
}

export function BackupsProyecto({
  proyectoId,
  proyectoNombre,
  destinoConfigurado,
  estado,
  copias,
}: {
  proyectoId: string;
  proyectoNombre: string;
  destinoConfigurado: boolean;
  estado: BackupsProyectoVista | { error: string };
  copias: CopiaProyecto[] | { error: string } | null;
}) {
  if ("error" in estado) {
    return (
      <p role="alert" className="font-body text-xs text-state-error">
        {estado.error}
      </p>
    );
  }
  return (
    <Contenido
      proyectoId={proyectoId}
      proyectoNombre={proyectoNombre}
      destinoConfigurado={destinoConfigurado}
      estado={estado}
      copias={copias}
    />
  );
}

function Contenido({
  proyectoId,
  proyectoNombre,
  destinoConfigurado,
  estado,
  copias,
}: {
  proyectoId: string;
  proyectoNombre: string;
  destinoConfigurado: boolean;
  estado: BackupsProyectoVista;
  copias: CopiaProyecto[] | { error: string } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [habilitado, setHabilitado] = useState(estado.habilitado);
  const [incluidos, setIncluidos] = useState<Record<string, boolean>>(
    Object.fromEntries(estado.elementos.map((e) => [e.clave, e.incluido])),
  );
  const [elegida, setElegida] = useState<CopiaProyecto | null>(null);

  const ocupado = estado.restaurando || estado.enCurso;
  const puedeCopiar = destinoConfigurado && estado.valida && !ocupado;

  const cambiarHabilitado = () => {
    const nuevo = !habilitado;
    startTransition(async () => {
      const result = await habilitarProyectoBackupAction(proyectoId, nuevo);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setHabilitado(nuevo);
    });
  };

  const marcar = (clave: string, incluido: boolean) => {
    setIncluidos((actual) => ({ ...actual, [clave]: incluido }));
    startTransition(async () => {
      const result = await marcarElementoBackupAction(
        proyectoId,
        clave,
        incluido,
      );
      if (result && "error" in result) {
        setIncluidos((actual) => ({ ...actual, [clave]: !incluido }));
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Copies and restores run in the background: follow them until done. */}
      <DeployPoller isDeploying={ocupado} />

      {!destinoConfigurado && (
        <div className="rounded-[var(--radius-md)] border border-border bg-elevated px-3 py-2 font-body text-xs text-text-secondary">
          Aún no hay un destino de backups.{" "}
          <Link
            href="/configuracion?seccion=backups"
            className="text-accent underline"
          >
            Configuración → Backups
          </Link>
        </div>
      )}

      {estado.restaurando && (
        <p role="status" className="font-body text-xs text-state-deploying">
          Restaurando…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 font-body text-[13px]">
          <button
            type="button"
            role="switch"
            aria-checked={habilitado}
            aria-label="Copias de este Proyecto"
            disabled={isPending}
            onClick={cambiarHabilitado}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 ${
              habilitado ? "bg-[var(--color-accent)]" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                habilitado ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
          Incluir en la copia diaria
        </label>
        <p className="font-body text-xs text-text-muted">
          Última copia:{" "}
          {estado.ultima
            ? `${formatearFecha(estado.ultima.iniciadoEn)} · ${RESULTADO[estado.ultima.resultado]}`
            : "Ninguna"}
        </p>
        <div className="ml-auto flex items-center gap-2">
          {estado.enCurso && <BotonCancelarBackup />}
          <ProjectActionButton
            action={async () => {
              const result = await copiarProyectoBackupAction(proyectoId);
              router.refresh();
              return result;
            }}
            label="Copia ahora"
            pendingLabel="Copiando…"
            successMessage="Copia iniciada"
            disabled={!puedeCopiar}
            className={botonPrimario}
          />
        </div>
      </div>

      {!estado.valida ? (
        <p className="font-body text-xs text-text-muted">
          El Proyecto no tiene contenedores: despliégalo para detectar qué se
          puede copiar.
        </p>
      ) : (
        <ul className="flex flex-col">
          {estado.elementos.map((e) => (
            <li
              key={e.clave}
              className="flex items-center gap-3 border-t border-border py-2 first:border-t-0 font-body text-[12.5px]"
            >
              <input
                id={`elemento-${e.clave}`}
                type="checkbox"
                checked={incluidos[e.clave] ?? e.incluido}
                disabled={estado.restaurando}
                onChange={(ev) => marcar(e.clave, ev.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <label htmlFor={`elemento-${e.clave}`} className="font-mono">
                {e.clave}
              </label>
              <span className="ml-auto text-text-muted">
                {e.tipo === "bd" ? "Base de datos" : "Datos"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {estado.noCopiados.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="font-body text-xs font-semibold text-text-secondary">
            No se copia
          </h4>
          <ul className="flex flex-col gap-1">
            {estado.noCopiados.map((n) => (
              <li key={n.origen} className="font-body text-xs text-text-muted">
                <span className="font-mono">{n.origen}</span>
                <span> · </span>
                <span>{n.motivo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ListaCopias
        copias={copias}
        deshabilitado={ocupado}
        onElegir={setElegida}
      />

      {elegida && (
        <ModalRestaurar
          proyectoId={proyectoId}
          proyectoNombre={proyectoNombre}
          copia={elegida}
          onCerrar={() => setElegida(null)}
        />
      )}
    </div>
  );
}

function ListaCopias({
  copias,
  deshabilitado,
  onElegir,
}: {
  copias: CopiaProyecto[] | { error: string } | null;
  deshabilitado: boolean;
  onElegir: (c: CopiaProyecto) => void;
}) {
  if (copias === null) return null;
  if ("error" in copias) {
    return (
      <p role="alert" className="font-body text-xs text-state-error">
        {copias.error}
      </p>
    );
  }
  if (copias.length === 0) {
    return (
      <p className="font-body text-xs text-text-muted">
        Aún no hay copias de este Proyecto
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {copias.map((c) => (
        <li
          key={c.id}
          className="flex items-center gap-3 border-t border-border py-2 first:border-t-0 font-body text-[12.5px]"
        >
          <span className="whitespace-nowrap">{formatearFecha(c.fecha)}</span>
          <span className="text-text-secondary">{ORIGEN[c.origen]}</span>
          <span className="text-text-muted">
            {c.bytes === null ? "—" : formatearBytes(c.bytes)}
          </span>
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => onElegir(c)}
            className={`ml-auto ${botonSecundario}`}
          >
            Restaurar
          </button>
        </li>
      ))}
    </ul>
  );
}

function ModalRestaurar({
  proyectoId,
  proyectoNombre,
  copia,
  onCerrar,
}: {
  proyectoId: string;
  proyectoNombre: string;
  copia: CopiaProyecto;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [claves, setClaves] = useState<string[]>(
    copia.elementos.filter((e) => e.restaurable).map((e) => e.clave),
  );
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const alternar = (clave: string, marcada: boolean) =>
    setClaves((actual) =>
      marcada ? [...actual, clave] : actual.filter((c) => c !== clave),
    );

  const restaurar = () => {
    startTransition(async () => {
      setError(null);
      const result = await restaurarProyectoBackupAction(
        proyectoId,
        copia.id,
        claves,
        texto,
      );
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Restauración iniciada");
      onCerrar();
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(8,9,13,0.62)] backdrop-blur-[7px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restaurar-proyecto-titulo"
        className="w-[560px] max-w-full flex flex-col gap-4 bg-surface border border-border rounded-[var(--radius-lg)] p-[22px] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
      >
        <h2
          id="restaurar-proyecto-titulo"
          className="text-[17px] font-semibold"
        >
          Restaurar copia del {formatearFecha(copia.fecha)}
        </h2>
        <p className="font-body text-[12.5px] leading-relaxed text-text-secondary">
          Se reemplazará lo elegido por su contenido de esa fecha. Antes se hará
          una copia automática para poder deshacerlo y el Proyecto se parará
          mientras dure la restauración.
        </p>
        <ul className="flex flex-col gap-1">
          {copia.elementos.map((e) => (
            <li
              key={e.clave}
              className="flex flex-wrap items-center gap-2 font-body text-[12.5px]"
            >
              <input
                id={`restaurar-${e.clave}`}
                type="checkbox"
                disabled={!e.restaurable}
                checked={e.restaurable && claves.includes(e.clave)}
                onChange={(ev) => alternar(e.clave, ev.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <label htmlFor={`restaurar-${e.clave}`} className="font-mono">
                {e.clave}
              </label>
              {!e.restaurable && (
                <Link href="/guia" className="text-xs text-accent underline">
                  Se restaura a mano
                </Link>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="restaurar-proyecto-confirmacion"
            className="font-body text-xs text-text-muted"
          >
            Escribe {proyectoNombre} para confirmar
          </label>
          <input
            id="restaurar-proyecto-confirmacion"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
          />
        </div>
        {error && (
          <p role="alert" className="font-body text-xs text-state-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={restaurar}
            disabled={
              texto !== proyectoNombre || claves.length === 0 || isPending
            }
            aria-label="Restaurar copia"
            className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-state-error)] font-body text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Restaurando…" : "Restaurar"}
          </button>
        </div>
      </div>
    </div>
  );
}
