"use client";

import { useState } from "react";
import {
  IconX,
  IconLock,
  IconWarn,
  IconRedeploy,
  IconCheck,
  IconAlert,
} from "@/components/ui/icons";
import { SSLBadge } from "@/components/dashboard/SSLBadge";

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;

function Switch({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative w-[38px] h-[22px] rounded-full shrink-0 border transition-colors ${
        on
          ? "bg-[color-mix(in_oklab,var(--color-accent)_72%,transparent)] border-[var(--color-accent)]"
          : "bg-elevated border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
          on
            ? "translate-x-4 bg-white"
            : "translate-x-0 bg-[var(--color-text-muted)]"
        }`}
      />
    </button>
  );
}

export function DominioSSLModal({ onClose }: { onClose?: () => void }) {
  const [domain, setDomain] = useState("app.cliente.com");
  const [ssl, setSsl] = useState(true);
  const [redirect, setRedirect] = useState(true);

  const valid = DOMAIN_RE.test(domain.trim());
  const state = domain.length === 0 ? "empty" : valid ? "valid" : "error";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-[rgba(8,9,13,0.62)] backdrop-blur-[7px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-title"
        className="w-[640px] max-w-full max-h-[calc(100vh-48px)] flex flex-col bg-surface border border-border rounded-[var(--radius-lg)] overflow-hidden shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
      >
        {/* HEADER */}
        <div className="flex items-start gap-3 px-[22px] pt-5 pb-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <h1
              id="dm-title"
              className="text-[17px] font-semibold -tracking-[0.02em]"
            >
              Domain &amp; SSL
            </h1>
            <p className="font-body text-xs text-text-muted mt-[5px]">
              tienda-mari · proxy gestionado por Traefik v3
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid place-items-center w-[30px] h-[30px] rounded-[var(--radius-md)] text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* BODY */}
        <div className="px-[22px] py-5 overflow-y-auto flex flex-col gap-[18px]">
          {/* Domain input */}
          <div className="flex flex-col gap-[7px]">
            <label
              htmlFor="dm-domain"
              className="font-display text-[12.5px] font-medium text-text-primary flex items-center gap-2"
            >
              Dominio{" "}
              <span className="font-body text-[11px] text-text-muted font-normal">
                — dominio público que servirá este proyecto
              </span>
            </label>
            <div className="relative flex items-center">
              <input
                id="dm-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                placeholder="app.ejemplo.com"
                className={`w-full font-body text-[13px] text-text-primary bg-background border rounded-[var(--radius-md)] pl-3 pr-[38px] py-[11px] outline-none transition-[border-color,box-shadow] ${
                  state === "error"
                    ? "border-[var(--color-state-error)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-state-error)_26%,transparent)]"
                    : state === "valid"
                      ? "border-[color-mix(in_oklab,var(--color-state-running)_55%,var(--color-border))] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-state-running)_24%,transparent)]"
                      : "border-border focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_28%,transparent)]"
                }`}
              />
              <span className="absolute right-[11px] grid place-items-center">
                {state === "error" ? (
                  <IconAlert className="w-[15px] h-[15px] text-state-error" />
                ) : state === "valid" ? (
                  <IconCheck className="w-[15px] h-[15px] text-state-running" />
                ) : null}
              </span>
            </div>
            {state === "error" && (
              <span className="font-body text-[11px] text-state-error flex items-center gap-1.5">
                <IconAlert className="w-3 h-3" /> Formato de dominio no válido.
              </span>
            )}
          </div>

          {/* DNS warning */}
          <div className="flex gap-[11px] p-[12px_14px] rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--color-state-deploying)_13%,transparent)] border border-[color-mix(in_oklab,var(--color-state-deploying)_38%,transparent)]">
            <span className="text-state-deploying shrink-0 mt-px">
              <IconWarn className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-[color-mix(in_oklab,var(--color-state-deploying)_70%,var(--color-text-primary))]">
                El dominio aún no apunta a este servidor
              </div>
              <div className="font-body text-[11.5px] text-text-muted mt-[3px] leading-[1.55]">
                No se encontró un registro A para{" "}
                <code className="text-text-primary bg-[color-mix(in_oklab,var(--color-state-deploying)_10%,var(--color-elevated))] px-[5px] rounded-[var(--radius-sm)]">
                  {domain || "—"}
                </code>
                . Añade{" "}
                <code className="text-text-primary bg-[color-mix(in_oklab,var(--color-state-deploying)_10%,var(--color-elevated))] px-[5px] rounded-[var(--radius-sm)]">
                  A → 91.99.12.40
                </code>{" "}
                en tu DNS; Let&apos;s Encrypt no podrá emitir el certificado
                hasta que propague.
              </div>
              <button className="mt-[9px] inline-flex items-center gap-1.5 font-display text-[11.5px] font-medium text-state-deploying bg-transparent border border-[color-mix(in_oklab,var(--color-state-deploying)_45%,var(--color-border))] rounded-[var(--radius-sm)] px-[9px] py-[5px] hover:bg-[color-mix(in_oklab,var(--color-state-deploying)_16%,transparent)] transition-colors">
                <IconRedeploy className="w-3 h-3" /> Volver a comprobar DNS
              </button>
            </div>
          </div>

          {/* SSL toggle */}
          <div className="flex items-center gap-3.5 p-[14px_15px] border border-border rounded-[var(--radius-md)] bg-background">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium flex items-center gap-2.5">
                SSL / TLS{" "}
                <span className="ml-auto">
                  <SSLBadge estado={{ activo: ssl }} />
                </span>
              </div>
              <div className="font-body text-[11px] text-text-muted mt-[3px]">
                Emite y renueva el certificado automáticamente vía Let&apos;s
                Encrypt.
              </div>
            </div>
            <Switch on={ssl} onToggle={() => setSsl((v) => !v)} label="SSL" />
          </div>

          {/* Redirect toggle */}
          <div className="flex items-center gap-3.5 p-[14px_15px] border border-border rounded-[var(--radius-md)] bg-background">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">
                Redirigir HTTP → HTTPS
              </div>
              <div className="font-body text-[11px] text-text-muted mt-[3px]">
                Fuerza todo el tráfico del puerto 80 al 443 con un 308.
              </div>
            </div>
            <Switch
              on={redirect}
              onToggle={() => setRedirect((v) => !v)}
              label="Redirección HTTPS"
            />
          </div>

          {/* Cert info */}
          <div
            className={`border border-border rounded-[var(--radius-md)] overflow-hidden transition-opacity ${
              ssl ? "" : "opacity-40 pointer-events-none grayscale-[0.4]"
            }`}
          >
            <div className="flex items-center gap-2.5 px-[14px] py-[11px] bg-background border-b border-border">
              <span className="font-body text-[10.5px] uppercase tracking-[0.09em] text-text-muted">
                Certificado actual
              </span>
              <span className="ml-auto">
                <SSLBadge estado={{ activo: true }} />
              </span>
            </div>
            <div className="grid grid-cols-2">
              {(
                [
                  ["Dominio", "app.cliente.com", false],
                  ["Emisor", "Let's Encrypt (R3)", false],
                  ["Emitido", "14 jun 2026", false],
                  ["Caduca", "12 sep 2026 · en 83 días", true],
                ] as [string, string, boolean][]
              ).map(([l, v, ok], i) => (
                <div
                  key={l}
                  className={`p-[12px_14px] border-border ${i > 1 ? "border-t" : ""} ${
                    i % 2 === 0 ? "border-r" : ""
                  }`}
                >
                  <div className="font-body text-[10.5px] text-text-muted">
                    {l}
                  </div>
                  <div
                    className={`font-body text-[12.5px] mt-1 ${ok ? "text-state-running" : "text-text-primary"}`}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center gap-2.5 px-[22px] py-[15px] border-t border-border bg-[color-mix(in_oklab,var(--color-background)_40%,var(--color-surface))]">
          <span className="font-body text-[11px] text-text-muted inline-flex items-center gap-[7px]">
            <IconLock className="w-[13px] h-[13px]" /> Cambios aplicados al
            guardar
          </span>
          <span className="flex-1" />
          <button
            onClick={onClose}
            className="font-display text-[13px] font-medium px-4 py-[9px] rounded-[var(--radius-md)] border border-border text-text-muted hover:text-text-primary hover:bg-elevated transition-colors"
          >
            Cancelar
          </button>
          <button
            disabled={!valid}
            className="inline-flex items-center gap-1.5 font-display text-[13px] font-semibold px-4 py-[9px] rounded-[var(--radius-md)] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <IconCheck className="w-3.5 h-3.5" /> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
