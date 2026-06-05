// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  logoutAction: vi.fn(),
  iniciarAction: vi.fn().mockResolvedValue(undefined),
  detenerAction: vi.fn().mockResolvedValue(undefined),
  restartAction: vi.fn().mockResolvedValue(undefined),
  eliminarClienteAction: vi.fn().mockResolvedValue(undefined),
  crearProyectoAction: vi.fn().mockResolvedValue(undefined),
  editarClienteAction: vi.fn().mockResolvedValue(undefined),
  eliminarProyectoAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useContainerLogs", () => ({
  useContainerLogs: vi.fn().mockReturnValue({
    lines: [],
    connected: false,
    error: null,
    clear: vi.fn(),
  }),
}));

vi.mock("./ClienteForm", () => ({
  ClienteFormModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="cliente-form-modal">
      <button onClick={onClose}>Cerrar</button>
    </div>
  ),
}));

vi.mock("./ProyectoForm", () => ({
  ProyectoFormModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="proyecto-form-modal">
      <button onClick={onClose}>Cerrar</button>
    </div>
  ),
}));

import { ClientSection } from "@/components/dashboard/ClientSection";
import { eliminarClienteAction } from "@/app/(panel)/actions";
import type { ClienteConProyectos } from "@/lib/schemas/dashboard";

const cliente: ClienteConProyectos = {
  id: "c1",
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(screen.queryByText("web-app")).not.toBeInTheDocument();
    expect(screen.queryByText("api")).not.toBeInTheDocument();
  });

  it("muestra los botones de acción del cliente", () => {
    render(<ClientSection cliente={cliente} />);
    expect(
      screen.getByRole("button", { name: /nuevo proyecto/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /editar cliente/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eliminar cliente/i }),
    ).toBeInTheDocument();
  });

  it("click en Nuevo proyecto abre el modal de proyecto", () => {
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /nuevo proyecto/i }));
    expect(screen.getByTestId("proyecto-form-modal")).toBeInTheDocument();
  });

  it("click en Editar cliente abre el modal de cliente", () => {
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /editar cliente/i }));
    expect(screen.getByTestId("cliente-form-modal")).toBeInTheDocument();
  });

  it("click en Eliminar cliente muestra confirmación", () => {
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar cliente/i }));
    expect(screen.getByText(/¿Eliminar cliente?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sí$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^no$/i })).toBeInTheDocument();
  });

  it("confirmar eliminar llama eliminarClienteAction con el id del cliente", async () => {
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar cliente/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sí$/i }));
    await waitFor(() => {
      expect(eliminarClienteAction).toHaveBeenCalledWith("c1");
    });
  });

  it("click en No cancela la confirmación de eliminar", () => {
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar cliente/i }));
    fireEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(screen.queryByText(/¿Eliminar cliente?/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eliminar cliente/i }),
    ).toBeInTheDocument();
  });

  it("muestra error cuando eliminarClienteAction falla", async () => {
    vi.mocked(eliminarClienteAction).mockResolvedValueOnce({
      error: "No se puede eliminar un cliente con proyectos",
    });
    render(<ClientSection cliente={cliente} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar cliente/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sí$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No se puede eliminar un cliente con proyectos",
      );
    });
  });
});
