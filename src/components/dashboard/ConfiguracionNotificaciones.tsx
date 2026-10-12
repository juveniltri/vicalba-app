"use client";

import {
  guardarEmailAction,
  guardarTelegramAction,
  guardarWebhookAction,
  probarEmailAction,
} from "@/app/(panel)/actions";
import { useState, useTransition } from "react";
import { formatHace } from "@/lib/formatHace";

type ConfigData = {
  webhookHabilitado: boolean;
  webhookUrl: string | null;
  emailHabilitado: boolean;
  emailSmtpHost: string | null;
  emailSmtpPort: number | null;
  emailSmtpUser: string | null;
  emailRemitente: string | null;
  emailDestinatario: string | null;
  telegramHabilitado: boolean;
  telegramBotTokenConfigurado: boolean;
  telegramChatId: string | null;
  estadoCanales?: Record<
    "email" | "telegram" | "webhook",
    { ultimoEnvioEn: Date | string | null; ultimoError: string | null }
  >;
} | null;

function EstadoCanal({
  habilitado,
  estado,
}: {
  habilitado: boolean;
  estado?: { ultimoEnvioEn: Date | string | null; ultimoError: string | null };
}) {
  const pastilla =
    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] font-body text-[11px] font-semibold";
  if (!habilitado)
    return (
      <span className={`${pastilla} bg-stopped-bg text-stopped-text`}>
        Desactivado
      </span>
    );
  if (!estado?.ultimoEnvioEn)
    return (
      <span className={`${pastilla} bg-stopped-bg text-stopped-text`}>
        Sin envíos todavía
      </span>
    );
  const hace = formatHace(new Date(estado.ultimoEnvioEn));
  if (estado.ultimoError)
    return (
      <span className="flex basis-full flex-col gap-2 order-last">
        <span className={`${pastilla} self-start bg-error-bg text-error-text`}>
          <span
            className="size-1.5 rounded-[2px] bg-state-error"
            aria-hidden="true"
          />
          Último envío falló · {hace}
        </span>
        <span className="px-3 py-2 rounded-[var(--radius-md)] bg-error-bg border border-error-border font-body text-xs text-error-text break-words">
          {estado.ultimoError}
        </span>
      </span>
    );
  return (
    <span className={`${pastilla} bg-running-bg text-running-text`}>
      <span
        className="size-1.5 rounded-full bg-state-running"
        aria-hidden="true"
      />
      Funcionando · {hace}
    </span>
  );
}

export function ConfiguracionNotificaciones({
  config,
}: {
  config: ConfigData;
}) {
  const [webhookHabilitado, setWebhookHabilitado] = useState(
    config?.webhookHabilitado ?? false,
  );
  const [webhookUrl, setWebhookUrl] = useState(config?.webhookUrl ?? "");

  const [emailHabilitado, setEmailHabilitado] = useState(
    config?.emailHabilitado ?? false,
  );
  const [smtpHost, setSmtpHost] = useState(config?.emailSmtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(
    String(config?.emailSmtpPort ?? 587),
  );
  const [smtpUser, setSmtpUser] = useState(config?.emailSmtpUser ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [remitente, setRemitente] = useState(config?.emailRemitente ?? "");
  const [destinatario, setDestinatario] = useState(
    config?.emailDestinatario ?? "",
  );

  const [telegramHabilitado, setTelegramHabilitado] = useState(
    config?.telegramHabilitado ?? false,
  );
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(config?.telegramChatId ?? "");

  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{
    texto: string;
    error: boolean;
  } | null>(null);

  const mostrarMensaje = (texto: string) => {
    setMensaje({ texto, error: false });
    setTimeout(() => setMensaje(null), 3000);
  };

  // Errors stay until the next action: SMTP messages are long and need reading.
  const mostrarError = (texto: string) => setMensaje({ texto, error: true });

  return (
    <div className="flex flex-col gap-4">
      {mensaje && (
        <p
          role={mensaje.error ? "alert" : "status"}
          className={`font-body text-xs break-words ${
            mensaje.error ? "text-error-text" : "text-running-text"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {/* Webhook */}
      <section
        aria-labelledby="canal-webhook"
        className={`rounded-[var(--radius-lg)] bg-surface border p-5 ${config?.estadoCanales?.webhook.ultimoError && webhookHabilitado ? "border-error-border" : "border-border"}`}
      >
        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <input
            id="webhook-toggle"
            type="checkbox"
            aria-label="Habilitar Webhook"
            checked={webhookHabilitado}
            onChange={(e) => setWebhookHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            id="canal-webhook"
            htmlFor="webhook-toggle"
            className="font-display text-[15px] font-semibold cursor-pointer"
          >
            Webhook
          </label>
          <EstadoCanal
            habilitado={webhookHabilitado}
            estado={config?.estadoCanales?.webhook}
          />
        </div>

        {webhookHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="webhook-url"
                className="font-body text-xs text-text-muted"
              >
                URL del Webhook
              </label>
              <input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.ejemplo.com/notify"
                className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
              />
            </div>
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarWebhookAction(
                webhookHabilitado,
                webhookUrl || undefined,
              );
              mostrarMensaje("Webhook guardado");
            })
          }
          disabled={isPending}
          className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Guardar
        </button>
      </section>

      {/* Email */}
      <section
        aria-labelledby="canal-email"
        className={`rounded-[var(--radius-lg)] bg-surface border p-5 ${config?.estadoCanales?.email.ultimoError && emailHabilitado ? "border-error-border" : "border-border"}`}
      >
        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <input
            id="email-toggle"
            type="checkbox"
            aria-label="Habilitar Email"
            checked={emailHabilitado}
            onChange={(e) => setEmailHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            id="canal-email"
            htmlFor="email-toggle"
            className="font-display text-[15px] font-semibold cursor-pointer"
          >
            Email
          </label>
          <EstadoCanal
            habilitado={emailHabilitado}
            estado={config?.estadoCanales?.email}
          />
        </div>

        {emailHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            {[
              {
                id: "smtp-host",
                label: "SMTP Host",
                value: smtpHost,
                setter: setSmtpHost,
                type: "text",
                placeholder: "smtp.ejemplo.com",
              },
              {
                id: "smtp-port",
                label: "SMTP Port",
                value: smtpPort,
                setter: setSmtpPort,
                type: "number",
                placeholder: "587",
              },
              {
                id: "smtp-user",
                label: "SMTP User",
                value: smtpUser,
                setter: setSmtpUser,
                type: "text",
                placeholder: "user@ejemplo.com",
              },
              {
                id: "smtp-pass",
                label: "SMTP Pass",
                value: smtpPass,
                setter: setSmtpPass,
                type: "password",
                placeholder: "••••••",
              },
              {
                id: "email-remitente",
                label: "Remitente",
                value: remitente,
                setter: setRemitente,
                type: "email",
                placeholder: "panel@vicalba.com",
              },
              {
                id: "email-destinatario",
                label: "Destinatario",
                value: destinatario,
                setter: setDestinatario,
                type: "email",
                placeholder: "admin@cliente.com",
              },
            ].map(({ id, label, value, setter, type, placeholder }) => (
              <div key={id} className="flex flex-col gap-1">
                <label
                  htmlFor={id}
                  className="font-body text-xs text-text-muted"
                >
                  {label}
                </label>
                <input
                  id={id}
                  type={type}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              const res = await guardarEmailAction(emailHabilitado, {
                smtpHost: smtpHost || undefined,
                smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
                smtpUser: smtpUser || undefined,
                smtpPass: smtpPass || undefined,
                remitente: remitente || undefined,
                destinatario: destinatario || undefined,
              });
              if (res?.error) mostrarError(res.error);
              else mostrarMensaje("Email guardado");
            })
          }
          disabled={isPending}
          className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              const res = await probarEmailAction();
              if (res.ok) mostrarMensaje("Correo de prueba enviado");
              else mostrarError(`No se pudo enviar: ${res.error}`);
            })
          }
          disabled={isPending}
          className="ml-2 inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong bg-transparent font-body text-[12.5px] text-text-primary hover:bg-elevated disabled:opacity-50"
        >
          Enviar prueba
        </button>
      </section>

      {/* Telegram */}
      <section
        aria-labelledby="canal-telegram"
        className={`rounded-[var(--radius-lg)] bg-surface border p-5 ${config?.estadoCanales?.telegram.ultimoError && telegramHabilitado ? "border-error-border" : "border-border"}`}
      >
        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <input
            id="telegram-toggle"
            type="checkbox"
            aria-label="Habilitar Telegram"
            checked={telegramHabilitado}
            onChange={(e) => setTelegramHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            id="canal-telegram"
            htmlFor="telegram-toggle"
            className="font-display text-[15px] font-semibold cursor-pointer"
          >
            Telegram
          </label>
          <EstadoCanal
            habilitado={telegramHabilitado}
            estado={config?.estadoCanales?.telegram}
          />
        </div>

        {telegramHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="telegram-token"
                className="font-body text-xs text-text-muted"
              >
                Bot Token
                {config?.telegramBotTokenConfigurado && (
                  <span className="ml-2 text-state-running">configurado</span>
                )}
              </label>
              <input
                id="telegram-token"
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={
                  config?.telegramBotTokenConfigurado
                    ? "dejar vacío para mantener el actual"
                    : "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                }
                className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="telegram-chat"
                className="font-body text-xs text-text-muted"
              >
                Chat ID
              </label>
              <input
                id="telegram-chat"
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                className="min-h-10 px-3 font-body text-[13px] text-text-primary bg-background border border-border-strong rounded-[var(--radius-md)]"
              />
            </div>
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarTelegramAction(
                telegramHabilitado,
                botToken || undefined,
                chatId || undefined,
              );
              mostrarMensaje("Telegram guardado");
            })
          }
          disabled={isPending}
          className="inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] bg-[var(--color-accent)] font-body text-[12.5px] font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          Guardar
        </button>
      </section>
    </div>
  );
}
