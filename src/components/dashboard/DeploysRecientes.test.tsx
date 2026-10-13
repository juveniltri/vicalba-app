// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeploysRecientes } from "./DeploysRecientes";
import type { DeployReciente } from "@/lib/schemas/dashboard";

const base: DeployReciente = {
  id: "d1",
  proyectoId: "p1",
  proyecto: "crm",
  cliente: "microcapilar",
  rama: "main",
  sha: "e881352abcdef",
  resultado: "exito",
  origen: "webhook",
  hace: "hace 2h",
};

describe("DeploysRecientes", () => {
  it("muestra cada deploy con proyecto, commit corto, origen y cuándo", () => {
    render(<DeploysRecientes deploys={[base]} />);

    const fila = screen.getAllByRole("row")[1]!;
    expect(
      within(fila).getByRole("link", { name: "microcapilar / crm" }),
    ).toHaveAttribute("href", "/proyectos/p1");
    expect(fila).toHaveTextContent("e881352");
    expect(fila).not.toHaveTextContent("e881352a");
    expect(fila).toHaveTextContent("webhook");
    expect(fila).toHaveTextContent("hace 2h");
  });

  it("etiqueta cada resultado con texto y no solo color", () => {
    render(
      <DeploysRecientes
        deploys={[
          base,
          { ...base, id: "d2", resultado: "error" },
          { ...base, id: "d3", resultado: "en_curso", sha: null },
          { ...base, id: "d4", resultado: "cancelado" },
        ]}
      />,
    );

    expect(screen.getByText("éxito")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("en curso")).toBeInTheDocument();
    expect(screen.getByText("cancelado")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("indica cuando todavía no hay deploys", () => {
    render(<DeploysRecientes deploys={[]} />);
    expect(screen.getByText(/aún no hay deploys/i)).toBeInTheDocument();
  });
});
