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
});
