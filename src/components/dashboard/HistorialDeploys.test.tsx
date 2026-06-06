// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistorialDeploys } from "./HistorialDeploys";

const now = new Date();

const deployExito = {
  id: "d1",
  rama: "main",
  resultado: "exito" as const,
  output: "Build completed successfully",
  iniciadoEn: new Date(now.getTime() - 60_000),
  finalizadoEn: new Date(now.getTime() - 58_000),
};

describe("HistorialDeploys", () => {
  it("muestra mensaje vacío cuando no hay deploys", () => {
    render(<HistorialDeploys deploys={[]} />);
    expect(screen.getByText("Sin deploys registrados.")).toBeInTheDocument();
  });

  it("muestra la rama y el resultado del deploy", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("exito")).toBeInTheDocument();
  });

  it("usa text-state-running para resultado exito", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("exito").className).toContain("text-state-running");
  });

  it("usa text-state-error para resultado error", () => {
    const deploys = [{ ...deployExito, resultado: "error" as const }];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("error").className).toContain("text-state-error");
  });

  it("usa text-state-deploying para resultado en_curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("en_curso").className).toContain(
      "text-state-deploying",
    );
  });

  it("muestra la duración en segundos cuando el deploy finalizó", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("2s")).toBeInTheDocument();
  });

  it("muestra guión como duración cuando el deploy está en curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renderiza el details/summary para ver el output", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("Ver output")).toBeInTheDocument();
    expect(
      screen.getByText("Build completed successfully"),
    ).toBeInTheDocument();
  });

  it("no renderiza details cuando output es null", () => {
    const deploys = [{ ...deployExito, output: null }];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.queryByText("Ver output")).toBeNull();
  });
});
