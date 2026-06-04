// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

describe("StatusBadge", () => {
  it('muestra la etiqueta "running"', () => {
    render(<StatusBadge estado="running" />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it('muestra la etiqueta "stopped"', () => {
    render(<StatusBadge estado="stopped" />);
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });

  it('muestra la etiqueta "error"', () => {
    render(<StatusBadge estado="error" />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it('muestra la etiqueta "deploying"', () => {
    render(<StatusBadge estado="deploying" />);
    expect(screen.getByText("deploying")).toBeInTheDocument();
  });
});
