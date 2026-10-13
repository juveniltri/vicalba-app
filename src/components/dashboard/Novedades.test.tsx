// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextoNovedad, VersionNovedades } from "./Novedades";

describe("TextoNovedad", () => {
  it("convierte **negrita** y `código` y deja el resto como texto", () => {
    const { container } = render(
      <TextoNovedad texto="Pestaña **Logs** con `GIT_SHA_SHORT` y <b>nada más</b>" />,
    );
    expect(container.querySelector("strong")).toHaveTextContent("Logs");
    expect(container.querySelector("code")).toHaveTextContent("GIT_SHA_SHORT");
    expect(container).toHaveTextContent("y <b>nada más</b>");
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("VersionNovedades", () => {
  it("muestra versión, fecha, resumen y los apartados con sus entradas", () => {
    render(
      <VersionNovedades
        version={{
          version: "2.1.0",
          fecha: "2026-10-14",
          resumen: "Control de los deploys.",
          apartados: [
            { titulo: "Novedades", entradas: ["Cancelar un deploy."] },
            { titulo: "Seguridad", entradas: ["Límite de intentos."] },
          ],
        }}
      />,
    );

    const seccion = screen.getByRole("region", { name: "v2.1.0" });
    expect(seccion).toHaveTextContent("14/10/2026");
    expect(seccion).toHaveTextContent("Control de los deploys.");
    expect(
      within(seccion).getByRole("heading", { name: "Seguridad" }),
    ).toBeInTheDocument();
    expect(within(seccion).getAllByRole("listitem")).toHaveLength(2);
  });

  it("no muestra fecha cuando la versión no la tiene", () => {
    render(
      <VersionNovedades
        version={{
          version: "2.0 y anteriores",
          fecha: null,
          resumen: null,
          apartados: [],
        }}
      />,
    );
    expect(
      screen.getByRole("region", { name: "v2.0 y anteriores" }),
    ).not.toHaveTextContent("/");
  });
});
