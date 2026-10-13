// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstadoVps } from "./EstadoVps";

const ok = {
  database: "ok" as const,
  docker: "ok" as const,
  proxy: "ok" as const,
  certificados: "ok" as const,
};

describe("EstadoVps", () => {
  it("muestra el estado de la base de datos y de Docker", () => {
    render(
      <EstadoVps
        checks={{ ...ok, docker: "error" }}
        version="0.9.0"
        certificados={[]}
      />,
    );

    expect(screen.getByText("PostgreSQL").parentElement).toHaveTextContent(
      "ok",
    );
    expect(screen.getByText("Docker daemon").parentElement).toHaveTextContent(
      "sin conexión",
    );
    expect(screen.getByText(/0\.9\.0/)).toBeInTheDocument();
  });

  it("avisa de los certificados que caducan pronto con su proyecto", () => {
    render(
      <EstadoVps
        checks={ok}
        version="0.9.0"
        certificados={[
          { proyectoId: "p1", nombre: "acme / web", dias: 9 },
          { proyectoId: "p2", nombre: "acme / api", dias: 0 },
        ]}
      />,
    );

    expect(screen.getByText("2 caducan pronto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /acme \/ web/ })).toHaveTextContent(
      "9 días",
    );
    expect(screen.getByRole("link", { name: /acme \/ api/ })).toHaveTextContent(
      "hoy",
    );
  });

  it("indica que los certificados están vigentes si ninguno caduca pronto", () => {
    render(<EstadoVps checks={ok} version="0.9.0" certificados={[]} />);
    expect(screen.getByText("vigentes")).toBeInTheDocument();
  });

  it("usa el singular con un solo día y un solo certificado", () => {
    render(
      <EstadoVps
        checks={ok}
        version="0.9.0"
        certificados={[{ proyectoId: "p1", nombre: "acme / web", dias: 1 }]}
      />,
    );
    expect(screen.getByText("1 caduca pronto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /acme \/ web/ })).toHaveTextContent(
      "1 día",
    );
  });

  it("muestra el estado de Traefik", () => {
    render(
      <EstadoVps
        checks={{ ...ok, proxy: "error" }}
        version="0.9.0"
        certificados={[]}
      />,
    );
    expect(screen.getByText("Traefik").parentElement).toHaveTextContent(
      "sin conexión",
    );
  });

  it("no da los certificados por vigentes si no se puede leer acme.json", () => {
    render(
      <EstadoVps
        checks={{ ...ok, certificados: "error" }}
        version="0.9.0"
        certificados={[]}
      />,
    );
    expect(screen.queryByText("vigentes")).not.toBeInTheDocument();
    expect(screen.getByText("Certificados").parentElement).toHaveTextContent(
      "no se pueden leer",
    );
  });
});
