"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  guardarProgramacionBackupAction,
  lanzarCopiaBackupAction,
  obtenerKitBackupAction,
} from "@/app/(panel)/actions";
import { Listbox } from "@/components/ui/Listbox";
import { useToast } from "@/components/ui/Toast";
import { formatHace } from "@/lib/formatHace";
import type {
  ConfiguracionBackupVista,
  CopiaBackup,
  EjecucionBackup,
} from "@/lib/schemas/dashboard";
import { CopiasBackup } from "./CopiasBackup";
import { DestinoBackupForm } from "./DestinoBackupForm";
import { HistorialBackups, formatearFecha } from "./HistorialBackups";
import { KitRecuperacionModal } from "./KitRecuperacionModal";

const HORAS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

function textoUltimaCopia(historial: EjecucionBackup[]): string {
  const ultima = historial.find((e) => e.operacion === "copia");
  if (!ultima) return "Ninguna";
  if (ultima.resultado === "en_curso") return "en curso";
  if (ultima.resultado === "error") return `falló: ${ultima.error ?? ""}`;
  return `${formatHace(ultima.iniciadoEn)} · correcta`;
}

export function ConfiguracionBackups({
  config,
  credenciales,
  historial,
  copias,
}: {
  config: ConfiguracionBackupVista;
  credenciales: Array<{ id: string; nombre: string }>;
  historial: EjecucionBackup[];
  copias: CopiaBackup[] | { error: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [habilitado, setHabilitado] = useState(config.habilitado);
  const [hora, setHora] = useState(config.hora);
  const [kit, setKit] = useState<string | null>(null);
  const [errorKit, setErrorKit] = useState<string | null>(null);

  const kitPendiente = config.tieneClave && !config.claveConfirmada;
  useEffect(() => {
    if (!kitPendiente) return;
    void obtenerKitBackupAction().then((result) => {
      if ("error" in result) setErrorKit(result.error);
      else setKit(result.kit);
    });
  }, [kitPendiente]);

  const guardarProgramacion = (nuevoHabilitado: boolean, nuevaHora: number) => {
    startTransition(async () => {
      const result = await guardarProgramacionBackupAction(
        nuevoHabilitado,
        nuevaHora,
      );
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      setHabilitado(nuevoHabilitado);
      setHora(nuevaHora);
      toast.success("Programación guardada");
      router.refresh();
    });
  };

  const hacerCopia = () => {
    startTransition(async () => {
      const result = await lanzarCopiaBackupAction();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Copia iniciada");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo="Estado">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dato etiqueta="Última copia" valor={textoUltimaCopia(historial)} />
          <Dato
            etiqueta="Próxima copia"
            valor={
              config.proximaCopia
                ? formatearFecha(config.proximaCopia)
                : "Backups desactivados"
            }
          />
        </div>
        <button
          type="button"
          onClick={hacerCopia}
          disabled={config.enCurso || isPending}
          className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Hacer copia ahora
        </button>
        {errorKit && (
          <p className="font-body text-xs text-state-error">{errorKit}</p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Destino">
        <DestinoBackupForm config={config} credenciales={credenciales} />
      </Tarjeta>

      <Tarjeta titulo="Programación">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 font-body text-[13px]">
            <button
              type="button"
              role="switch"
              aria-checked={habilitado}
              aria-label="Copia diaria"
              disabled={isPending}
              onClick={() => guardarProgramacion(!habilitado, hora)}
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
            Copia diaria
          </label>
          <div className="flex items-center gap-2">
            <span className="font-body text-xs text-text-muted">
              Hora (Madrid)
            </span>
            <Listbox
              ariaLabel="Hora de la copia"
              value={String(hora)}
              options={HORAS}
              onChange={(h) => guardarProgramacion(habilitado, Number(h))}
            />
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Historial">
        <HistorialBackups historial={historial} />
      </Tarjeta>

      <Tarjeta titulo="Copias disponibles">
        <CopiasBackup copias={copias} />
      </Tarjeta>

      {kit && (
        <KitRecuperacionModal
          kit={kit}
          onConfirmado={() => {
            setKit(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Tarjeta({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface border border-border p-5">
      <h3 className="font-display text-[13px] font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{etiqueta}</span>
      <span className="font-body text-[13px] break-words">{valor}</span>
    </div>
  );
}
