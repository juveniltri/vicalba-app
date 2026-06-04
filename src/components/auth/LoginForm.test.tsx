// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn().mockResolvedValue({ error: null }),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
