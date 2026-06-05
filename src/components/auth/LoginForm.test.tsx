// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "next-auth/react";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn().mockResolvedValue({ error: null }),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm — renderizado", () => {
  it("renders email input with label", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("renders password input with label", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("no muestra error al inicio", () => {
    render(<LoginForm />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("LoginForm — handleSubmit éxito", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockResolvedValue({ error: null });
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
  });

  it("llama a signIn con los valores del formulario", async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "admin@vicalba.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "secret123" },
    });

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "admin@vicalba.com",
        password: "secret123",
        redirect: false,
      });
    });
  });

  it("redirige a / cuando signIn devuelve sin error", async () => {
    render(<LoginForm />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(window.location.href).toBe("/");
    });
  });

  it("muestra el botón deshabilitado mientras carga", async () => {
    // signIn tarda — capturamos el estado intermedio
    let resolveSignIn!: (v: { error: string | null }) => void;
    vi.mocked(signIn).mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }) as ReturnType<typeof signIn>,
    );

    render(<LoginForm />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Entrando…" })).toBeDisabled();
    });

    // Resolvemos para limpiar timers
    resolveSignIn({ error: null });
    await waitFor(() => {
      expect(window.location.href).toBe("/");
    });
  });
});

describe("LoginForm — handleSubmit error de credenciales", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockResolvedValue({ error: "CredentialsSignin" });
  });

  it('muestra "Credenciales incorrectas" cuando signIn devuelve error', async () => {
    render(<LoginForm />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Credenciales incorrectas",
      );
    });
  });

  it("vuelve a habilitar el botón tras el error", async () => {
    render(<LoginForm />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
    });
  });

  it("no redirige cuando hay error de credenciales", async () => {
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
    render(<LoginForm />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Entrar" }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(window.location.href).not.toBe("/");
  });
});
