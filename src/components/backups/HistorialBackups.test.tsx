// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistorialBackups, formatearBytes } from "./HistorialBackups";

const fila = {
  finalizadoEn: null,
  snapshotId: null,
  bytesAnadidos: null,
  error: null,
  proyectoId: null,
  proyectoNombre: null,
};

describe("formatearBytes", () => {
  it.each([
    [512, "512 B"],
    [4096, "4 KB"],
    [1536, "1,5 KB"],
    [5 * 1024 * 1024, "5 MB"],
    [2.25 * 1024 ** 3, "2,3 GB"],
  ])("%d → %s", (n, texto) => {
    expect(formatearBytes(n)).toBe(texto);
  });
});

describe("HistorialBackups", () => {
  it("sin ejecuciones lo indica", () => {
    render(<HistorialBackups historial={[]} />);
    expect(
      screen.getByText("Aún no hay ninguna ejecución"),
    ).toBeInTheDocument();
  });

  it("muestra operación, origen, resultado, tamaño y el error de la fila fallida", () => {
    render(
      <HistorialBackups
        historial={[
          {
            ...fila,
            id: "b1",
            operacion: "copia",
            origen: "programado",
            resultado: "exito",
            iniciadoEn: new Date("2026-10-14T01:00:00Z"),
            snapshotId: "abc",
            bytesAnadidos: 4096,
          },
          {
            ...fila,
            id: "b2",
            operacion: "copia",
            origen: "antes_de_restaurar",
            resultado: "error",
            iniciadoEn: new Date("2026-10-13T01:00:00Z"),
            error: "403 Forbidden",
          },
          {
            ...fila,
            id: "b3",
            operacion: "restauracion",
            origen: "manual",
            resultado: "en_curso",
            iniciadoEn: new Date("2026-10-12T01:00:00Z"),
          },
        ]}
      />,
    );
    const [, correcta, fallida, restauracion] = screen.getAllByRole("row");
    expect(correcta).toHaveTextContent("14/10/26, 3:00");
    expect(correcta).toHaveTextContent("Copia");
    expect(correcta).toHaveTextContent("Programada");
    expect(correcta).toHaveTextContent("Correcta");
    expect(correcta).toHaveTextContent("4 KB");
    expect(fallida).toHaveTextContent("Antes de restaurar");
    expect(within(fallida!).getByText("403 Forbidden")).toBeInTheDocument();
    expect(fallida).toHaveTextContent("Error");
    expect(restauracion).toHaveTextContent("Restauración");
    expect(restauracion).toHaveTextContent("Manual");
    expect(restauracion).toHaveTextContent("En curso");
  });

  it("la columna Proyecto muestra Panel o el nombre del Proyecto", () => {
    render(
      <HistorialBackups
        historial={[
          {
            ...fila,
            id: "p1",
            operacion: "copia",
            origen: "manual",
            resultado: "exito",
            iniciadoEn: new Date("2026-10-14T01:00:00Z"),
          },
          {
            ...fila,
            id: "p2",
            operacion: "copia",
            origen: "manual",
            resultado: "exito",
            iniciadoEn: new Date("2026-10-14T02:00:00Z"),
            proyectoId: "x",
            proyectoNombre: "acme/crm",
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Proyecto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Panel")).toBeInTheDocument();
    expect(screen.getByText("acme/crm")).toBeInTheDocument();
  });
});
