// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
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

import { SidebarLink } from "@/components/layout/SidebarLink";

describe("SidebarLink", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("renderiza el texto del enlace", () => {
    mockUsePathname.mockReturnValue("/otro");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it('marca aria-current="page" cuando la ruta coincide con href', () => {
    mockUsePathname.mockReturnValue("/");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no marca aria-current cuando la ruta no coincide", () => {
    mockUsePathname.mockReturnValue("/proyectos");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
