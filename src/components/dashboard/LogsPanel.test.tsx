// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// LogsModal usa useContainerLogs internamente; lo mockeamos para los tests del panel
vi.mock("@/hooks/useContainerLogs", () => ({
  useContainerLogs: vi.fn().mockReturnValue({
    lines: [],
    connected: false,
    error: null,
    sinContenedores: false,
    clear: vi.fn(),
  }),
}));

import { LogsPanel } from "./LogsPanel";
import type { LogLine } from "@/hooks/useContainerLogs";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => vi.clearAllMocks());

const noOp = vi.fn();

// Todos los renders necesitan los nuevos props requeridos
const panelProps = {
  lines: [] as LogLine[],
  connected: false,
  error: null,
  onClose: noOp,
  proyectoId: "p1",
  proyectoNombre: "web-app",
};

describe("LogsPanel — estado de conexión", () => {
  it("muestra Live cuando connected es true", () => {
    render(<LogsPanel {...panelProps} connected={true} />);
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });

  it("muestra Disconnected cuando connected es false", () => {
    render(<LogsPanel {...panelProps} />);
    expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
  });
});

describe("LogsPanel — contenido", () => {
  it("muestra placeholder cuando no hay líneas", () => {
    render(<LogsPanel {...panelProps} />);
    expect(screen.getByText(/Esperando logs/)).toBeInTheDocument();
  });

  it("muestra las líneas de log con su servicio", () => {
    const lines: LogLine[] = [
      { servicio: "nginx", line: "server started" },
      { servicio: "node", line: "listening on 3000" },
    ];
    render(<LogsPanel {...panelProps} lines={lines} connected={true} />);
    expect(screen.getByText(/server started/)).toBeInTheDocument();
    expect(screen.getByText(/\[nginx\]/)).toBeInTheDocument();
    expect(screen.getByText(/listening on 3000/)).toBeInTheDocument();
  });

  it("muestra el mensaje de error cuando hay error", () => {
    render(<LogsPanel {...panelProps} error="Connection lost" />);
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });

  it("no muestra placeholder cuando hay error", () => {
    render(<LogsPanel {...panelProps} error="Connection lost" />);
    expect(screen.queryByText(/Esperando logs/)).not.toBeInTheDocument();
  });
});

describe("LogsPanel — interacción", () => {
  it("llama onClose al hacer click en el botón cerrar", () => {
    const onClose = vi.fn();
    render(<LogsPanel {...panelProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar logs/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("muestra el botón para abrir el modal de logs", () => {
    render(<LogsPanel {...panelProps} />);
    expect(
      screen.getByRole("button", { name: /expandir logs/i }),
    ).toBeInTheDocument();
  });

  it("abre el modal de logs al pulsar el botón expandir", async () => {
    render(<LogsPanel {...panelProps} />);
    fireEvent.click(screen.getByRole("button", { name: /expandir logs/i }));
    await waitFor(() =>
      expect(screen.getByText(/Logs — web-app/)).toBeInTheDocument(),
    );
  });

  it("cierra el modal al pulsar X dentro del modal", async () => {
    render(<LogsPanel {...panelProps} />);
    fireEvent.click(screen.getByRole("button", { name: /expandir logs/i }));
    await waitFor(() => screen.getByText(/Logs — web-app/));
    fireEvent.click(screen.getByRole("button", { name: /cerrar logs modal/i }));
    expect(screen.queryByText(/Logs — web-app/)).not.toBeInTheDocument();
  });
});
