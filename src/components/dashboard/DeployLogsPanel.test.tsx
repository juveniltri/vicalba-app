// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado: { lines: string[]; done: "exito" | "error" | null } = {
  lines: [],
  done: null,
};
vi.mock("@/hooks/useDeployLogs", () => ({
  useDeployLogs: () => estado,
}));

import { DeployLogsPanel } from "./DeployLogsPanel";

function fases() {
  const lista = screen.getByRole("list", { name: "Fases del deploy" });
  return within(lista)
    .getAllByRole("listitem")
    .map((li) => li.textContent);
}

beforeEach(() => {
  estado.lines = [];
  estado.done = null;
});

describe("DeployLogsPanel", () => {
  it("no se muestra si no hay deploy en curso ni líneas", () => {
    const { container } = render(
      <DeployLogsPanel proyectoId="p1" active={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marca la fase de repositorio en curso al empezar", () => {
    estado.lines = ["→ Clonando repositorio..."];
    render(<DeployLogsPanel proyectoId="p1" active />);

    expect(
      screen.getByRole("heading", { name: "Deploy en curso" }),
    ).toBeInTheDocument();
    expect(fases()).toEqual([
      "● Repositorio",
      "○ Checkout",
      "○ Build y arranque",
      "○ Red y proxy",
    ]);
  });

  it("avanza las fases según el log y muestra el commit", () => {
    estado.lines = [
      "→ Repositorio ya clonado, actualizando...",
      "→ Actualizando rama main...",
      "→ SHA: e881352abcdef",
      "→ Construyendo e iniciando contenedores...",
      "#12 RUN npm run build",
    ];
    render(<DeployLogsPanel proyectoId="p1" active />);

    expect(fases()).toEqual([
      "✓ Repositorio",
      "✓ Checkout",
      "● Build y arranque",
      "○ Red y proxy",
    ]);
    expect(screen.getByText("e881352")).toBeInTheDocument();
    expect(screen.getByText("#12 RUN npm run build")).toBeInTheDocument();
  });

  it("al terminar con éxito marca todas las fases", () => {
    estado.lines = [
      "→ SHA: abc",
      "→ Construyendo e iniciando contenedores...",
      "✓ Deploy completado",
    ];
    estado.done = "exito";
    render(<DeployLogsPanel proyectoId="p1" active={false} />);

    expect(
      screen.getByRole("heading", { name: "Deploy completado" }),
    ).toBeInTheDocument();
    expect(fases().every((f) => f?.startsWith("✓"))).toBe(true);
  });

  it("al fallar marca en error la fase en la que se quedó", () => {
    estado.lines = [
      "→ SHA: abc",
      "→ Construyendo e iniciando contenedores...",
      "exit code 1",
    ];
    estado.done = "error";
    render(<DeployLogsPanel proyectoId="p1" active={false} />);

    expect(
      screen.getByRole("heading", { name: "Deploy fallido" }),
    ).toBeInTheDocument();
    expect(fases()).toEqual([
      "✓ Repositorio",
      "✓ Checkout",
      "■ Build y arranque",
      "○ Red y proxy",
    ]);
  });

  it("para imágenes sin repositorio empieza directamente en el build", () => {
    estado.lines = ["→ Construyendo e iniciando contenedores..."];
    render(<DeployLogsPanel proyectoId="p1" active />);

    expect(fases()).toEqual([
      "✓ Repositorio",
      "✓ Checkout",
      "● Build y arranque",
      "○ Red y proxy",
    ]);
  });

  it("indica que espera salida cuando aún no hay líneas", () => {
    render(<DeployLogsPanel proyectoId="p1" active />);
    expect(screen.getByText(/esperando output/i)).toBeInTheDocument();
  });
});
