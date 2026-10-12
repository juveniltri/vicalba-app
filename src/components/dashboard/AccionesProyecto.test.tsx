// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./LogsModal", () => ({
  LogsModal: ({
    open,
    onClose,
    proyectoNombre,
  }: {
    open: boolean;
    onClose: () => void;
    proyectoNombre: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={`Logs de ${proyectoNombre}`}>
        <button onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

import { BotonFijar, BotonLogsContenedor } from "./AccionesProyecto";

afterEach(() => localStorage.clear());

describe("BotonFijar", () => {
  it("fija y desfija el proyecto indicando su estado", async () => {
    render(<BotonFijar proyectoId="p1" />);
    const boton = screen.getByRole("button", {
      name: "Fijar en la barra lateral",
    });
    expect(boton).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(boton);

    expect(boton).toHaveAttribute("aria-pressed", "true");
    expect(boton).toHaveAccessibleName("Quitar de fijados");
    expect(JSON.parse(localStorage.getItem("vicalba:fijados")!)).toEqual([
      "p1",
    ]);
  });
});

describe("BotonLogsContenedor", () => {
  it("abre y cierra los logs del contenedor", async () => {
    render(<BotonLogsContenedor proyectoId="p1" proyectoNombre="crm" />);

    await userEvent.click(
      screen.getByRole("button", { name: /logs del contenedor/i }),
    );
    expect(
      screen.getByRole("dialog", { name: "Logs de crm" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
