// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
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

describe("Sidebar", () => {
  it("renderiza el nombre de la aplicación", () => {
    render(<Sidebar />);
    expect(screen.getByText("VICALBA")).toBeInTheDocument();
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
});
