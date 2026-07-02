// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GestionCredenciales } from "./GestionCredenciales";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  crearCredencialAction: vi.fn().mockResolvedValue(undefined),
  eliminarCredencialAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  crearCredencialAction,
  eliminarCredencialAction,
} from "@/app/(panel)/actions";

const credencialesBase = [
  {
    id: "c1",
    nombre: "GitHub producción",
    creadoEn: new Date(),
  },
  {
    id: "c2",
    nombre: "GitLab staging",
    creadoEn: new Date(),
  },
];

describe("GestionCredenciales — renderizado", () => {
  it("muestra las credenciales existentes", () => {
    render(<GestionCredenciales credencialesIniciales={credencialesBase} />);
    expect(screen.getByText("GitHub producción")).toBeInTheDocument();
    expect(screen.getByText("GitLab staging")).toBeInTheDocument();
  });

  it("enmascara la clave SSH con puntos en lugar de mostrarla", () => {
    render(<GestionCredenciales credencialesIniciales={credencialesBase} />);
    const celdas = screen.getAllByText(/^•+$/);
    expect(celdas.length).toBeGreaterThan(0);
  });

  it("muestra mensaje vacío si no hay credenciales", () => {
    render(<GestionCredenciales credencialesIniciales={[]} />);
    expect(screen.getByText(/sin credenciales/i)).toBeInTheDocument();
  });

  it("muestra botón Nueva credencial", () => {
    render(<GestionCredenciales credencialesIniciales={[]} />);
    expect(
      screen.getByRole("button", { name: /nueva credencial/i }),
    ).toBeInTheDocument();
  });
});

describe("GestionCredenciales — formulario de creación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra formulario al pulsar Nueva credencial", () => {
    render(<GestionCredenciales credencialesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva credencial/i }));
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/clave pública/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/clave privada/i)).toBeInTheDocument();
  });

  it("oculta formulario al cancelar", () => {
    render(<GestionCredenciales credencialesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva credencial/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
  });

  it("llama a crearCredencialAction con los datos del formulario", async () => {
    render(<GestionCredenciales credencialesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva credencial/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Mi clave" },
    });
    fireEvent.change(screen.getByLabelText(/clave pública/i), {
      target: { value: "ssh-rsa AAAA..." },
    });
    fireEvent.change(screen.getByLabelText(/clave privada/i), {
      target: { value: "-----BEGIN RSA PRIVATE KEY-----" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /guardar credencial/i }),
    );
    await waitFor(() => {
      expect(crearCredencialAction).toHaveBeenCalledWith(
        "Mi clave",
        "ssh-rsa AAAA...",
        "-----BEGIN RSA PRIVATE KEY-----",
      );
    });
  });

  it("muestra error si crearCredencialAction falla", async () => {
    vi.mocked(crearCredencialAction).mockResolvedValueOnce({
      error: "Ya existe una credencial con ese nombre",
    });
    render(<GestionCredenciales credencialesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva credencial/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Duplicado" },
    });
    fireEvent.change(screen.getByLabelText(/clave pública/i), {
      target: { value: "ssh-rsa AAAA..." },
    });
    fireEvent.change(screen.getByLabelText(/clave privada/i), {
      target: { value: "-----BEGIN RSA PRIVATE KEY-----" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /guardar credencial/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/ya existe una credencial/i)).toBeInTheDocument();
    });
  });
});

describe("GestionCredenciales — eliminar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra confirmación antes de eliminar", () => {
    render(<GestionCredenciales credencialesIniciales={credencialesBase} />);
    const eliminarBtns = screen.getAllByRole("button", {
      name: /eliminar github producción/i,
    });
    fireEvent.click(eliminarBtns[0]);
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
    expect(eliminarCredencialAction).not.toHaveBeenCalled();
  });

  it("cancela la eliminación al pulsar cancelar", () => {
    render(<GestionCredenciales credencialesIniciales={credencialesBase} />);
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar github producción/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(eliminarCredencialAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /confirmar/i }),
    ).not.toBeInTheDocument();
  });

  it("llama a eliminarCredencialAction al confirmar", async () => {
    render(<GestionCredenciales credencialesIniciales={credencialesBase} />);
    fireEvent.click(
      screen.getByRole("button", { name: /eliminar github producción/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => {
      expect(eliminarCredencialAction).toHaveBeenCalledWith("c1");
    });
  });
});
