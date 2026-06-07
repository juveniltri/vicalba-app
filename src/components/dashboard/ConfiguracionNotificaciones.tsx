"use client";

import {
  guardarEmailAction,
  guardarTelegramAction,
  guardarWebhookAction,
} from "@/app/(panel)/actions";
import { useState, useTransition } from "react";

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
  telegramBotToken: string | null;
  telegramChatId: string | null;
} | null;

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
  const [botToken, setBotToken] = useState(config?.telegramBotToken ?? "");
  const [chatId, setChatId] = useState(config?.telegramChatId ?? "");

  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const mostrarMensaje = (txt: string) => {
    setMensaje(txt);
    setTimeout(() => setMensaje(null), 3000);
  };

  return (
    <div className="flex flex-col gap-4">
      {mensaje && (
        <p className="font-body text-xs text-state-running">{mensaje}</p>
      )}

      {/* Webhook */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="webhook-toggle"
            type="checkbox"
            aria-label="Habilitar Webhook"
            checked={webhookHabilitado}
            onChange={(e) => setWebhookHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="webhook-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Webhook
          </label>
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
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
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
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar
        </button>
      </div>

      {/* Email */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="email-toggle"
            type="checkbox"
            aria-label="Habilitar Email"
            checked={emailHabilitado}
            onChange={(e) => setEmailHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="email-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Email
          </label>
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
                  className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarEmailAction(emailHabilitado, {
                smtpHost: smtpHost || undefined,
                smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
                smtpUser: smtpUser || undefined,
                smtpPass: smtpPass || undefined,
                remitente: remitente || undefined,
                destinatario: destinatario || undefined,
              });
              mostrarMensaje("Email guardado");
            })
          }
          disabled={isPending}
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar
        </button>
      </div>

      {/* Telegram */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="telegram-toggle"
            type="checkbox"
            aria-label="Habilitar Telegram"
            checked={telegramHabilitado}
            onChange={(e) => setTelegramHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="telegram-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Telegram
          </label>
        </div>

        {telegramHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="telegram-token"
                className="font-body text-xs text-text-muted"
              >
                Bot Token
              </label>
              <input
                id="telegram-token"
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
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
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
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
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
