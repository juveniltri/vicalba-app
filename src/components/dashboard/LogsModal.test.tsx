// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockClear = vi.fn();
const mockUseContainerLogs = vi.fn();

vi.mock("@/hooks/useContainerLogs", () => ({
  useContainerLogs: (...args: unknown[]) => mockUseContainerLogs(...args),
}));

import { LogsModal, VisorLogs } from "./LogsModal";
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

  it("no abre la conexión de logs cuando open es false", () => {
    setup();
    render(<LogsModal {...defaultProps} open={false} />);
    expect(mockUseContainerLogs).not.toHaveBeenCalledWith("p1");
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

  it("filtra por nivel las líneas JSON que Docker prefija con su marca de tiempo", () => {
    const lines: LogLine[] = [
      {
        servicio: "app",
        line: `2026-10-14T18:31:32.144219483Z ${JSON.stringify({ level: 50, msg: "error msg", time: 0 })}`,
      },
      {
        servicio: "app",
        line: `2026-10-14T18:31:33.144219483Z ${JSON.stringify({ level: 30, msg: "info msg", time: 0 })}`,
      },
    ];
    setup(lines);
    render(<LogsModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Filtro ERR/ }));
    expect(screen.getByText("error msg")).toBeInTheDocument();
    expect(screen.queryByText("info msg")).not.toBeInTheDocument();
  });

  it("en las líneas de texto usa la hora de Docker y no la repite en el mensaje", () => {
    setup([
      {
        servicio: "app",
        line: "2026-10-14T18:31:32.144219483Z servidor listo",
      },
    ]);
    render(<LogsModal {...defaultProps} />);
    expect(screen.getByText("18:31:32")).toBeInTheDocument();
    expect(screen.getByText("servidor listo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /toggle timestamps/i }));
    expect(screen.queryByText(/18:31:32/)).not.toBeInTheDocument();
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

describe("LogsModal — estado del stream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("avisa de que no hay contenedores en vez de esperar logs", () => {
    setup([], { sinContenedores: true });
    render(<LogsModal {...defaultProps} />);
    expect(
      screen.getByText("El proyecto no tiene contenedores en marcha."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Esperando logs…")).not.toBeInTheDocument();
  });

  it("indica al final del log que los contenedores se han detenido", () => {
    setup([{ servicio: "web", line: "apagando" }], { finalizado: true });
    render(<LogsModal {...defaultProps} />);
    expect(screen.getByText("apagando")).toBeInTheDocument();
    expect(
      screen.getByText("Los contenedores se han detenido."),
    ).toBeInTheDocument();
  });
});

describe("VisorLogs — incrustado en la página", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup([{ servicio: "web", line: "arrancado" }], { connected: true });
  });

  it("muestra los logs del proyecto sin el marco del modal ni botón de cerrar", () => {
    const { container } = render(
      <VisorLogs proyectoId="p1" titulo="Logs del contenedor" />,
    );

    expect(mockUseContainerLogs).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Logs del contenedor")).toBeInTheDocument();
    expect(screen.getByText("arrancado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /cerrar logs modal/i }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".fixed")).toBeNull();
  });

  it("el auto-scroll desplaza solo el área de logs, no la página", () => {
    const scrollPagina = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollPagina;

    render(<VisorLogs proyectoId="p1" titulo="Logs del contenedor" />);

    expect(scrollPagina).not.toHaveBeenCalled();
  });
});
