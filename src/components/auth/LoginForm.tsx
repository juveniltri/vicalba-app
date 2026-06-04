"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = e.currentTarget;
    const result = await signIn("credentials", {
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      password: (form.elements.namedItem("password") as HTMLInputElement).value,
      redirect: false,
    });
    if (result?.error) {
      setError("Credenciales incorrectas");
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="w-full max-w-sm p-8 bg-surface border border-border rounded-[var(--radius-md)]">
      <h1 className="font-display text-xl font-bold text-text-primary mb-6">
        VICALBA
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="font-body text-sm text-text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="px-3 py-2 bg-background border border-border rounded-[var(--radius-sm)] font-body text-sm text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="font-body text-sm text-text-muted"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="px-3 py-2 bg-background border border-border rounded-[var(--radius-sm)] font-body text-sm text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        {error && (
          <p role="alert" className="font-body text-sm text-state-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 px-4 py-2 bg-primary-500 text-white font-body text-sm font-medium rounded-[var(--radius-sm)] hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
