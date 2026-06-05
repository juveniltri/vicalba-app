// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(panel)/actions", () => ({
  crearClienteAction: vi.fn().mockResolvedValue(undefined),
  editarClienteAction: vi.fn().mockResolvedValue(undefined),
}));

import { crearClienteAction, editarClienteAction } from "@/app/(panel)/actions";
import { ClienteFormModal, NuevoClienteButton } from "./ClienteForm";

const onClose = vi.fn();

describe("ClienteFormModal — nuevo cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearClienteAction).mockResolvedValue(undefined);
    vi.mocked(editarClienteAction).mockResolvedValue(undefined);
  });

  it("renders slug and nombre fields", () => {
    render(<ClienteFormModal onClose={onClose} />);
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });

  it("calls crearClienteAction with slug and nombre on submit", async () => {
    render(<ClienteFormModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/slug/i), {
      target: { value: "mi-cliente" },
    });
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Mi Cliente" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearClienteAction).toHaveBeenCalledWith(
        "mi-cliente",
        "Mi Cliente",
      );
    });
  });

  it("shows error when action returns error", async () => {
    vi.mocked(crearClienteAction).mockResolvedValue({
      error: "El slug ya existe",
    });

    render(<ClienteFormModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/slug/i), {
      target: { value: "cliente-uno" },
    });
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Cliente Uno" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("El slug ya existe");
    });
  });

  it("calls onClose when action succeeds", async () => {
    render(<ClienteFormModal onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/slug/i), {
      target: { value: "cliente" },
    });
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Cliente" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe("ClienteFormModal — editar cliente", () => {
  const cliente = { id: "c1", slug: "cli-uno", nombre: "Cliente Uno" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearClienteAction).mockResolvedValue(undefined);
    vi.mocked(editarClienteAction).mockResolvedValue(undefined);
  });

  it("hides slug field and pre-fills nombre", () => {
    render(<ClienteFormModal cliente={cliente} onClose={onClose} />);
    expect(screen.queryByLabelText(/slug/i)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Cliente Uno")).toBeInTheDocument();
  });

  it("calls editarClienteAction with id and new nombre on submit", async () => {
    render(<ClienteFormModal cliente={cliente} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Nuevo Nombre" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(editarClienteAction).toHaveBeenCalledWith("c1", "Nuevo Nombre");
    });
  });
});

describe("NuevoClienteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearClienteAction).mockResolvedValue(undefined);
    vi.mocked(editarClienteAction).mockResolvedValue(undefined);
  });

  it("renders the nuevo cliente button", () => {
    render(<NuevoClienteButton />);
    expect(
      screen.getByRole("button", { name: /nuevo cliente/i }),
    ).toBeInTheDocument();
  });

  it("opens the form modal when clicked", () => {
    render(<NuevoClienteButton />);
    fireEvent.click(screen.getByRole("button", { name: /nuevo cliente/i }));
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });
});
