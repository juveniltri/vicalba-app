// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("muestra el título como encabezado principal y el comando", () => {
    render(<PageHeader comando="ls proyectos" titulo="Proyectos" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Proyectos" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ls proyectos/)).toBeInTheDocument();
  });

  it("muestra las acciones cuando se pasan", () => {
    render(
      <PageHeader comando="estado" titulo="Dashboard">
        <button>Nuevo</button>
      </PageHeader>,
    );
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeInTheDocument();
  });
});
