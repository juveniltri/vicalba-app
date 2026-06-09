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
  tipo: "compose",
  puerto: null,
  imagenUrl: null,
  dockerfilePath: null,
  buildCommand: null,
  startCommand: null,
  ultimoDeploy: null,
};

describe("ProyectoFormModal — nuevo proyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearProyectoAction).mockResolvedValue(undefined);
    vi.mocked(editarProyectoAction).mockResolvedValue(undefined);
  });

  it("renders nombre, tipo, dominio, puerto, repositorioUrl and rama fields without servicios", () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tipo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dominio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/puerto/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repositorio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/rama/i)).toBeInTheDocument();
    expect(screen.queryByText(/servicio/i)).not.toBeInTheDocument();
  });

  it("passes dominio to the action when filled", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.change(screen.getByLabelText(/dominio/i), {
      target: { value: "app.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearProyectoAction).toHaveBeenCalledWith(
        CLIENT_ID,
        "proyecto",
        "app.example.com",
        undefined,
        "main",
        "compose",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it("calls crearProyectoAction with filled data on submit", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "mi-proyecto" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(crearProyectoAction).toHaveBeenCalledWith(
        CLIENT_ID,
        "mi-proyecto",
        undefined,
        undefined,
        "main",
        "compose",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  it("passes repositorioUrl and rama to action when filled", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
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
        "https://github.com/org/repo",
        "develop",
        "compose",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
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
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("does not show servicios validation error (servicios removed)", async () => {
    render(<ProyectoFormModal clienteId={CLIENT_ID} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "proyecto" },
    });
    fireEvent.click(screen.getByRole("button", { name: /crear/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/añade al menos un servicio/i),
    ).not.toBeInTheDocument();
  });
});

describe("ProyectoFormModal — editar proyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearProyectoAction).mockResolvedValue(undefined);
    vi.mocked(editarProyectoAction).mockResolvedValue(undefined);
  });

  it("populates fields from existing proyecto without servicios", () => {
    render(
      <ProyectoFormModal
        clienteId={CLIENT_ID}
        proyecto={mockProyecto}
        onClose={onClose}
      />,
    );
    expect(screen.getByDisplayValue("web-app")).toBeInTheDocument();
    expect(screen.getByDisplayValue("app.example.com")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("https://github.com/org/web-app"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("develop")).toBeInTheDocument();
    expect(screen.queryByText(/servicio/i)).not.toBeInTheDocument();
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
        "https://github.com/org/web-app",
        "develop",
        "compose",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });
});
