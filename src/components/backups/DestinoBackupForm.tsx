"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarDestinoBackupAction } from "@/app/(panel)/actions";
import { Listbox } from "@/components/ui/Listbox";
import { useToast } from "@/components/ui/Toast";
import type { ConfiguracionBackupVista } from "@/lib/schemas/dashboard";

type Tipo = "s3" | "sftp";

const INPUT =
  "min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]";

export function DestinoBackupForm({
  config,
  credenciales,
}: {
  config: ConfiguracionBackupVista;
  credenciales: Array<{ id: string; nombre: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>(config.tipoDestino ?? "s3");
  const [s3, setS3] = useState({
    endpoint: config.s3.endpoint ?? "",
    bucket: config.s3.bucket ?? "",
    region: config.s3.region ?? "",
    prefijo: config.s3.prefijo ?? "",
    accessKeyId: config.s3.accessKeyId ?? "",
    secretKey: "",
  });
  const [sftp, setSftp] = useState({
    host: config.sftp.host ?? "",
    puerto: String(config.sftp.puerto),
    usuario: config.sftp.usuario ?? "",
    ruta: config.sftp.ruta ?? "",
    credencialId: config.sftp.credencialId ?? "",
  });
  const [clave, setClave] = useState("");

  const guardar = () => {
    startTransition(async () => {
      setError(null);
      const comun = clave ? { clave } : {};
      const result = await guardarDestinoBackupAction(
        tipo === "s3"
          ? { tipo, ...s3, ...comun }
          : {
              tipo,
              ...sftp,
              puerto: Number(sftp.puerto),
              ...comun,
            },
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setClave("");
      toast.success(`Destino guardado: repositorio ${result.repositorio}`);
      router.refresh();
    });
  };

  const campoS3 = (
    id: keyof typeof s3,
    etiqueta: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Campo id={`s3-${id}`} etiqueta={etiqueta}>
      <input
        id={`s3-${id}`}
        value={s3[id]}
        onChange={(e) => setS3({ ...s3, [id]: e.target.value })}
        className={INPUT}
        {...extra}
      />
    </Campo>
  );

  const campoSftp = (
    id: Exclude<keyof typeof sftp, "credencialId">,
    etiqueta: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <Campo id={`sftp-${id}`} etiqueta={etiqueta}>
      <input
        id={`sftp-${id}`}
        value={sftp[id]}
        onChange={(e) => setSftp({ ...sftp, [id]: e.target.value })}
        className={INPUT}
        {...extra}
      />
    </Campo>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Tipo de destino"
        className="inline-flex self-start rounded-[var(--radius-md)] border border-border-strong p-0.5"
      >
        {(["s3", "sftp"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tipo === t}
            onClick={() => setTipo(t)}
            className={`min-h-8 px-3 rounded-[var(--radius-sm)] font-body text-[12.5px] ${
              tipo === t
                ? "bg-elevated text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tipo === "s3" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campoS3("endpoint", "Endpoint", {
            placeholder: "https://s3.eu-central-003.backblazeb2.com",
          })}
          {campoS3("bucket", "Bucket")}
          {campoS3("region", "Región", { placeholder: "Opcional" })}
          {campoS3("prefijo", "Prefijo", { placeholder: "Opcional" })}
          {campoS3("accessKeyId", "Access key ID", { autoComplete: "off" })}
          {campoS3("secretKey", "Secret key", {
            type: "password",
            autoComplete: "new-password",
            placeholder: config.s3.tieneSecretKey
              ? "Guardada — vacío para mantenerla"
              : "",
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {campoSftp("host", "Host")}
          {campoSftp("puerto", "Puerto", {
            type: "number",
            min: 1,
            max: 65535,
          })}
          {campoSftp("usuario", "Usuario")}
          {campoSftp("ruta", "Ruta", { placeholder: "/srv/vicalba" })}
          <div className="flex flex-col gap-1">
            <span className="font-body text-xs text-text-muted">
              Credencial SSH
            </span>
            <Listbox
              ariaLabel="Credencial SSH"
              value={sftp.credencialId}
              options={credenciales.map((c) => ({
                value: c.id,
                label: c.nombre,
              }))}
              onChange={(credencialId) => setSftp({ ...sftp, credencialId })}
            />
            {credenciales.length === 0 && (
              <p className="font-body text-xs text-text-muted">
                Crea una credencial SSH en «Credenciales SSH» y añade su clave
                pública al servidor de copias.
              </p>
            )}
          </div>
        </div>
      )}

      {!config.tieneClave && (
        <Campo
          id="backup-clave"
          etiqueta="Clave de un repositorio existente (opcional)"
        >
          <input
            id="backup-clave"
            type="password"
            autoComplete="off"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className={INPUT}
          />
          <p className="font-body text-xs text-text-muted">
            Solo si recuperas una VPS: la clave de tu kit. Si lo dejas vacío, el
            Panel genera una nueva.
          </p>
        </Campo>
      )}

      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={guardar}
        disabled={isPending}
        className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
      >
        {isPending ? "Probando…" : "Probar y guardar"}
      </button>
    </div>
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
