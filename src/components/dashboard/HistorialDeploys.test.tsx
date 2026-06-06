// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistorialDeploys } from "./HistorialDeploys";

const now = new Date();
const mockOnRollback = vi.fn().mockResolvedValue(undefined);

const deployExito = {
  id: "d1",
  rama: "main",
  sha: "abc123",
  resultado: "exito" as const,
  output: "Build completed successfully",
  iniciadoEn: new Date(now.getTime() - 60_000),
  finalizadoEn: new Date(now.getTime() - 58_000),
};

const defaultProps = {
  deploys: [deployExito],
  isDeploying: false,
  onRollback: mockOnRollback,
};

describe("HistorialDeploys", () => {
  it("muestra mensaje vacío cuando no hay deploys", () => {
    render(
      <HistorialDeploys
        deploys={[]}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.getByText("Sin deploys registrados.")).toBeInTheDocument();
  });

  it("muestra la rama y el resultado del deploy", () => {
    render(<HistorialDeploys {...defaultProps} />);
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("exito")).toBeInTheDocument();
  });

  it("usa text-state-running para resultado exito", () => {
    render(<HistorialDeploys {...defaultProps} />);
    expect(screen.getByText("exito").className).toContain("text-state-running");
  });

  it("usa text-state-error para resultado error", () => {
    const deploys = [{ ...deployExito, resultado: "error" as const }];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.getByText("error").className).toContain("text-state-error");
  });

  it("usa text-state-deploying para resultado en_curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.getByText("en_curso").className).toContain(
      "text-state-deploying",
    );
  });

  it("muestra la duración en segundos cuando el deploy finalizó", () => {
    render(<HistorialDeploys {...defaultProps} />);
    expect(screen.getByText("2s")).toBeInTheDocument();
  });

  it("muestra guión como duración cuando el deploy está en curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renderiza el details/summary para ver el output", () => {
    render(<HistorialDeploys {...defaultProps} />);
    expect(screen.getByText("Ver output")).toBeInTheDocument();
    expect(
      screen.getByText("Build completed successfully"),
    ).toBeInTheDocument();
  });

  it("no renderiza details cuando output es null", () => {
    const deploys = [{ ...deployExito, output: null }];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.queryByText("Ver output")).toBeNull();
  });

  it("muestra botón Rollback en deploy exitoso con sha", () => {
    render(<HistorialDeploys {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Rollback" }),
    ).toBeInTheDocument();
  });

  it("no muestra botón Rollback si sha es null", () => {
    const deploys = [{ ...deployExito, sha: null }];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rollback" })).toBeNull();
  });

  it("no muestra botón Rollback si resultado es error", () => {
    const deploys = [{ ...deployExito, resultado: "error" as const }];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rollback" })).toBeNull();
  });

  it("no muestra botón Rollback si resultado es en_curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(
      <HistorialDeploys
        deploys={deploys}
        isDeploying={false}
        onRollback={mockOnRollback}
      />,
    );
    expect(screen.queryByRole("button", { name: "Rollback" })).toBeNull();
  });

  it("deshabilita el botón Rollback cuando isDeploying es true", () => {
    render(<HistorialDeploys {...defaultProps} isDeploying={true} />);
    expect(screen.getByRole("button", { name: "Rollback" })).toBeDisabled();
  });
});
