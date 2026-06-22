// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/app/(panel)/actions", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: string;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "@/components/layout/Sidebar";

beforeEach(() => vi.clearAllMocks());

describe("Sidebar", () => {
  it("renderiza el nombre de la aplicación", () => {
    render(<Sidebar />);
    expect(screen.getByText("vicalba")).toBeInTheDocument();
  });

  it("renderiza el enlace Dashboard", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renderiza el enlace Proyectos", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Proyectos" })).toBeInTheDocument();
  });

  it("renderiza el enlace Configuración", () => {
    render(<Sidebar />);
    expect(
      screen.getByRole("link", { name: "Configuración" }),
    ).toBeInTheDocument();
  });

  it("el nav tiene el label de navegación principal", () => {
    render(<Sidebar />);
    expect(
      screen.getByRole("navigation", { name: "navegación principal" }),
    ).toBeInTheDocument();
  });

  it("muestra el botón de cambio de tema", () => {
    render(<Sidebar />);
    expect(
      screen.getByRole("button", { name: /activar modo claro/i }),
    ).toBeInTheDocument();
  });
});
