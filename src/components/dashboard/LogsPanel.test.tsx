// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LogsPanel } from "./LogsPanel";
import type { LogLine } from "@/hooks/useContainerLogs";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const noOp = vi.fn();

describe("LogsPanel — estado de conexión", () => {
  it("muestra Live cuando connected es true", () => {
    render(
      <LogsPanel lines={[]} connected={true} error={null} onClose={noOp} />,
    );
    expect(screen.getByText(/Live/)).toBeInTheDocument();
  });

  it("muestra Disconnected cuando connected es false", () => {
    render(
      <LogsPanel lines={[]} connected={false} error={null} onClose={noOp} />,
    );
    expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
  });
});

describe("LogsPanel — contenido", () => {
  it("muestra placeholder cuando no hay líneas", () => {
    render(
      <LogsPanel lines={[]} connected={false} error={null} onClose={noOp} />,
    );
    expect(screen.getByText(/Esperando logs/)).toBeInTheDocument();
  });

  it("muestra las líneas de log con su servicio", () => {
    const lines: LogLine[] = [
      { servicio: "nginx", line: "server started" },
      { servicio: "node", line: "listening on 3000" },
    ];
    render(
      <LogsPanel lines={lines} connected={true} error={null} onClose={noOp} />,
    );
    expect(screen.getByText(/server started/)).toBeInTheDocument();
    expect(screen.getByText(/\[nginx\]/)).toBeInTheDocument();
    expect(screen.getByText(/listening on 3000/)).toBeInTheDocument();
  });

  it("muestra el mensaje de error cuando hay error", () => {
    render(
      <LogsPanel
        lines={[]}
        connected={false}
        error="Connection lost"
        onClose={noOp}
      />,
    );
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
  });

  it("no muestra placeholder cuando hay error", () => {
    render(
      <LogsPanel
        lines={[]}
        connected={false}
        error="Connection lost"
        onClose={noOp}
      />,
    );
    expect(screen.queryByText(/Esperando logs/)).not.toBeInTheDocument();
  });
});

describe("LogsPanel — interacción", () => {
  it("llama onClose al hacer click en el botón cerrar", () => {
    const onClose = vi.fn();
    render(
      <LogsPanel lines={[]} connected={false} error={null} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cerrar logs/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
