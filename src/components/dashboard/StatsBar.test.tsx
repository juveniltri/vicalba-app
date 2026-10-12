// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsBar } from "@/components/dashboard/StatsBar";
import type { EstadoServicio } from "@/lib/mock-data";

const proyectos: Array<{ estado: EstadoServicio }> = [
  { estado: "running" },
  { estado: "running" },
  { estado: "stopped" },
  { estado: "error" },
  { estado: "deploying" },
];

describe("StatsBar", () => {
  it("muestra el total de proyectos", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-total")).getByText("5"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos running", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-running")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos stopped", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-stopped")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos en error", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-error")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("muestra 0 en categorías sin proyectos", () => {
    render(<StatsBar proyectos={[{ estado: "deploying" }]} />);
    expect(
      within(screen.getByTestId("stat-running")).getByText("0"),
    ).toBeInTheDocument();
  });

  it("indica en cuántos clientes están repartidos los proyectos", () => {
    render(<StatsBar proyectos={proyectos} clientes={3} />);
    expect(
      within(screen.getByTestId("stat-total")).getByText("en 3 clientes"),
    ).toBeInTheDocument();
  });

  it("usa el singular con un solo cliente", () => {
    render(<StatsBar proyectos={proyectos} clientes={1} />);
    expect(
      within(screen.getByTestId("stat-total")).getByText("en 1 cliente"),
    ).toBeInTheDocument();
  });

  it("resalta los errores solo cuando hay alguno", () => {
    const { rerender } = render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-error")).getByText("requieren atención"),
    ).toBeInTheDocument();

    rerender(<StatsBar proyectos={[{ estado: "running" }]} />);
    expect(
      within(screen.getByTestId("stat-error")).getByText("todo en orden"),
    ).toBeInTheDocument();
  });
});
