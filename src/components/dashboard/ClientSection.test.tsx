// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  logoutAction: vi.fn(),
  iniciarAction: vi.fn().mockResolvedValue(undefined),
  detenerAction: vi.fn().mockResolvedValue(undefined),
}));

import { ClientSection } from "@/components/dashboard/ClientSection";
import type { ClienteConProyectos } from "@/lib/schemas/dashboard";

const cliente: ClienteConProyectos = {
  slug: "cliente-test",
  nombre: "Cliente Test",
  proyectos: [
    {
      id: "p1",
      nombre: "web-app",
      clienteSlug: "cliente-test",
      estado: "running",
      servicios: [],
      dominio: null,
      ultimoDeploy: null,
    },
    {
      id: "p2",
      nombre: "api",
      clienteSlug: "cliente-test",
      estado: "stopped",
      servicios: [],
      dominio: null,
      ultimoDeploy: null,
    },
  ],
};

describe("ClientSection", () => {
  it("muestra el nombre del cliente", () => {
    render(<ClientSection cliente={cliente} />);
    expect(screen.getByText("Cliente Test")).toBeInTheDocument();
  });

  it("renderiza una tarjeta por proyecto", () => {
    render(<ClientSection cliente={cliente} />);
    expect(screen.getByText("web-app")).toBeInTheDocument();
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("renderiza cero tarjetas si el cliente no tiene proyectos", () => {
    render(<ClientSection cliente={{ ...cliente, proyectos: [] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
