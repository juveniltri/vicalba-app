// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AbrirUrlBoton } from "./AbrirUrlBoton";

describe("AbrirUrlBoton", () => {
  it("no renderiza nada si no hay dominio", () => {
    const { container } = render(
      <AbrirUrlBoton dominio={null} sslActivo={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("usa https:// si sslActivo es true", () => {
    render(<AbrirUrlBoton dominio="app.ejemplo.com" sslActivo={true} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://app.ejemplo.com",
    );
  });

  it("usa http:// si sslActivo es false", () => {
    render(<AbrirUrlBoton dominio="app.ejemplo.com" sslActivo={false} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "http://app.ejemplo.com",
    );
  });

  it("usa http:// si sslActivo es null (sin info SSL)", () => {
    render(<AbrirUrlBoton dominio="app.ejemplo.com" sslActivo={null} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "http://app.ejemplo.com",
    );
  });

  it("abre en nueva pestaña con rel correcto", () => {
    render(<AbrirUrlBoton dominio="app.ejemplo.com" sslActivo={true} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("tiene tooltip 'Abrir en el navegador'", () => {
    render(<AbrirUrlBoton dominio="app.ejemplo.com" sslActivo={true} />);
    expect(screen.getByTitle("Abrir en el navegador")).toBeInTheDocument();
  });
});
