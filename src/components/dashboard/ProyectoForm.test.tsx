// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(panel)/actions", () => ({
  crearProyectoAction: vi.fn().mockResolvedValue(undefined),
  editarProyectoAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  crearProyectoAction,
  editarProyectoAction,
} from "@/app/(panel)/actions";
import { ProyectoFormModal } from "./ProyectoForm";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";

const onClose = vi.fn();
const CLIENT_ID = "c1";

const mockProyecto: ProyectoResumen = {
  id: "p1",
  nombre: "web-app",
  clienteSlug: "cliente-uno",
  estado: "stopped",
  dominio: "app.example.com",
  repositorioUrl: "https://github.com/org/web-app",
  rama: "develop",
  autoDeployHabilitado: false,
  servicios: [{ nombre: "nginx", estado: "stopped" }],
  ultimoDeploy: null,
};

describe("ProyectoFormModal — nuevo proyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearProyectoAction).mockResolvedValue(undefined);
    vi.mocked(editarProyectoAction).mockResolvedValue(undefined);
  });

  it("can add a second servicio field", () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    expect(screen.getByLabelText("Servicio 2")).toBeInTheDocument();
  });

  it("can remove a servicio field when multiple exist", () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir servicio/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar servicio 1/i }),
    );
    expect(screen.queryByLabelText("Servicio 2")).not.toBeInTheDocument();
  });

  it("passes dominio to the action when filled", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.change(screen.getByLabelText(/dominio/i), {
      target: { value: "app.example.com" },
    });
    fireEvent.change(screen.getByLabelText("Servicio 1"), {
      target: { value: "nginx" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearProyectoAction).toHaveBeenCalledWith(
        CLIENT_ID,
        "proyecto",
        "app.example.com",
        ["nginx"],
        undefined,
        "main",
      );
    });
  });

  it("renders nombre, dominio, repositorioUrl, rama and one servicio field", () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dominio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repositorio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rama/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Servicio 1")).toBeInTheDocument();
  });

  it("calls crearProyectoAction with filled data on submit", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "mi-proyecto" },
    });
    fireEvent.change(screen.getByLabelText("Servicio 1"), {
      target: { value: "nginx" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearProyectoAction).toHaveBeenCalledWith(
        CLIENT_ID,
        "mi-proyecto",
        undefined,
        ["nginx"],
        undefined,
        "main",
      );
    });
  });

  it("passes repositorioUrl and rama to action when filled", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.change(screen.getByLabelText("Servicio 1"), {
      target: { value: "nginx" },
    });
    fireEvent.change(screen.getByLabelText(/repositorio/i), {
      target: { value: "https://github.com/org/repo" },
    });
    fireEvent.change(screen.getByLabelText(/rama/i), {
      target: { value: "develop" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearProyectoAction).toHaveBeenCalledWith(
        CLIENT_ID,
        "proyecto",
        undefined,
        ["nginx"],
        "https://github.com/org/repo",
        "develop",
      );
    });
  });

  it("shows error when action returns error", async () => {
    vi.mocked(crearProyectoAction).mockResolvedValue({
      error: "Nombre ya existe",
    });

    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.change(screen.getByLabelText("Servicio 1"), {
      target: { value: "nginx" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Nombre ya existe");
    });
  });

  it("calls onClose when action succeeds", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.change(screen.getByLabelText("Servicio 1"), {
      target: { value: "nginx" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error when no servicio filled in", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(crearProyectoAction).not.toHaveBeenCalled();
  });
});

describe("ProyectoFormModal — editar proyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearProyectoAction).mockResolvedValue(undefined);
    vi.mocked(editarProyectoAction).mockResolvedValue(undefined);
  });

  it("populates fields from existing proyecto", () => {
    render(
      <ProyectoFormModal
        clienteId={CLIENT_ID}
        proyecto={mockProyecto}
        onClose={onClose}
      />,
    );
    expect(screen.getByDisplayValue("web-app")).toBeInTheDocument();
    expect(screen.getByDisplayValue("app.example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("nginx")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://github.com/org/web-app"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("develop")).toBeInTheDocument();
  });

  it("calls editarProyectoAction with updated data on submit", async () => {
    render(
      <ProyectoFormModal
        clienteId={CLIENT_ID}
        proyecto={mockProyecto}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByDisplayValue("web-app"), {
      target: { value: "web-app-v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(editarProyectoAction).toHaveBeenCalledWith(
        "p1",
        "web-app-v2",
        "app.example.com",
        ["nginx"],
        "https://github.com/org/web-app",
        "develop",
      );
    });
  });
});
