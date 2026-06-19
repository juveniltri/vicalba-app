// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockClear = vi.fn();
const mockUseContainerLogs = vi.fn();

vi.mock("@/hooks/useContainerLogs", () => ({
  useContainerLogs: (...args: unknown[]) => mockUseContainerLogs(...args),
}));

import { LogsModal } from "./LogsModal";
import type { LogLine } from "@/hooks/useContainerLogs";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function setup(lines: LogLine[] = [], extra: object = {}) {
  mockUseContainerLogs.mockReturnValue({
    lines,
    connected: false,
    error: null,
    sinContenedores: false,
    clear: mockClear,
    ...extra,
  });
}

const defaultProps = {
  proyectoId: "p1",
  proyectoNombre: "web-app",
  open: true,
  onClose: vi.fn(),
};

describe("LogsModal — visibilidad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it("no renderiza nada cuando open es false", () => {
    const { container } = render(<LogsModal {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza el modal con el nombre del proyecto cuando open es true", () => {
    render(<LogsModal {...defaultProps} />);
    expect(screen.getByText(/Logs — web-app/)).toBeInTheDocument();
  });

  it("llama a onClose al pulsar el botón de cerrar", () => {
    const onClose = vi.fn();
    render(<LogsModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar logs modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pasa null a useContainerLogs cuando open es false", () => {
    setup();
    render(<LogsModal {...defaultProps} open={false} />);
    // El hook se llama siempre (regla de hooks), pero con null para no conectar
    expect(mockUseContainerLogs).toHaveBeenCalledWith(null);
  });

  it("pasa el proyectoId a useContainerLogs cuando open es true", () => {
    render(<LogsModal {...defaultProps} />);
    expect(mockUseContainerLogs).toHaveBeenCalledWith("p1");
  });
});

describe("LogsModal — filtros de nivel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra los botones de filtro ALL ERR WARN INFO DEBUG", () => {
    setup();
    render(<LogsModal {...defaultProps} />);
    for (const label of ["ALL", "ERR", "WARN", "INFO", "DEBUG"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`Filtro ${label}`) }),
      ).toBeInTheDocument();
    }
  });

  it("ALL muestra todas las líneas (JSON y no-JSON)", () => {
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 50, msg: "error msg", time: 0 }),
      },
      { servicio: "app", line: "raw output line" },
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "info msg", time: 0 }),
      },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    expect(screen.getByText("error msg")).toBeInTheDocument();
    expect(screen.getByText(/raw output line/)).toBeInTheDocument();
    expect(screen.getByText("info msg")).toBeInTheDocument();
  });

  it("filtro ERR solo muestra líneas con nivel >= 50 y líneas no-JSON", () => {
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 50, msg: "error msg", time: 0 }),
      },
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "info msg", time: 0 }),
      },
      { servicio: "app", line: "raw output" },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Filtro ERR/ }));
    expect(screen.getByText("error msg")).toBeInTheDocument();
    expect(screen.queryByText("info msg")).not.toBeInTheDocument();
    expect(screen.getByText(/raw output/)).toBeInTheDocument();
  });

  it("filtro WARN muestra nivel >= 40 y líneas no-JSON", () => {
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 40, msg: "warn msg", time: 0 }),
      },
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "info msg", time: 0 }),
      },
      { servicio: "app", line: "raw output" },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Filtro WARN/ }));
    expect(screen.getByText("warn msg")).toBeInTheDocument();
    expect(screen.queryByText("info msg")).not.toBeInTheDocument();
    expect(screen.getByText(/raw output/)).toBeInTheDocument();
  });

  it("filtro INFO muestra nivel >= 30 y líneas no-JSON", () => {
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "info msg", time: 0 }),
      },
      {
        servicio: "app",
        line: JSON.stringify({ level: 20, msg: "debug msg", time: 0 }),
      },
      { servicio: "app", line: "raw output" },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Filtro INFO/ }));
    expect(screen.getByText("info msg")).toBeInTheDocument();
    expect(screen.queryByText("debug msg")).not.toBeInTheDocument();
    expect(screen.getByText(/raw output/)).toBeInTheDocument();
  });

  it("líneas no-JSON son siempre visibles con cualquier filtro", () => {
    const lines: LogLine[] = [
      { servicio: "app", line: "raw container output" },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Filtro ERR/ }));
    expect(screen.getByText(/raw container output/)).toBeInTheDocument();
  });
});

describe("LogsModal — toggle timestamps", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra el botón de toggle TS", () => {
    setup();
    render(<LogsModal {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /toggle timestamps/i }),
    ).toBeInTheDocument();
  });

  it("muestra el timestamp de una línea JSON cuando TS está activo", () => {
    const ts = new Date("2024-01-15T14:32:01.000Z").getTime();
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "hello", time: ts }),
      },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    // TS activo por defecto: muestra la hora HH:MM:SS
    expect(screen.getByText("14:32:01")).toBeInTheDocument();
  });

  it("oculta el timestamp al desactivar TS", () => {
    const ts = new Date("2024-01-15T14:32:01.000Z").getTime();
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: JSON.stringify({ level: 30, msg: "hello", time: ts }),
      },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /toggle timestamps/i }));
    expect(screen.queryByText("14:32:01")).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});

describe("LogsModal — controles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("el botón Limpiar buffer llama a clear()", () => {
    setup();
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /limpiar buffer/i }));
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("el checkbox Auto-scroll está presente y marcado por defecto", () => {
    setup();
    render(<LogsModal {...defaultProps} />);
    const cb = screen.getByRole("checkbox", { name: /auto-scroll/i });
    expect(cb).toBeInTheDocument();
    expect(cb).toBeChecked();
  });

  it("muestra el estado de conexión Live cuando connected es true", () => {
    setup([], { connected: true });
    render(<LogsModal {...defaultProps} />);
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });
});
