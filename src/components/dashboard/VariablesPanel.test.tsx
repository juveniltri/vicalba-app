// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VariablesPanel } from "./VariablesPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  crearVariableAction: vi.fn().mockResolvedValue(undefined),
  actualizarVariableAction: vi.fn().mockResolvedValue(undefined),
  eliminarVariableAction: vi.fn().mockResolvedValue(undefined),
  revelarVariableAction: vi
    .fn()
    .mockResolvedValue({ valor: "postgres://secret" }),
}));

import {
  crearVariableAction,
  actualizarVariableAction,
  eliminarVariableAction,
  revelarVariableAction,
} from "@/app/(panel)/actions";

const variablesBase = [
  { id: "v1", clave: "DATABASE_URL", creadoEn: new Date() },
  { id: "v2", clave: "JWT_SECRET", creadoEn: new Date() },
];

describe("VariablesPanel — renderizado", () => {
  it("muestra las claves de las variables", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    expect(screen.getByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("JWT_SECRET")).toBeInTheDocument();
  });

  it("muestra los valores enmascarados", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const masks = screen.getAllByText("••••••••");
    expect(masks).toHaveLength(2);
  });

  it("muestra mensaje vacío si no hay variables", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    expect(screen.getByText(/sin variables/i)).toBeInTheDocument();
  });
});

describe("VariablesPanel — revelar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("llama a revelarVariableAction y muestra el valor en claro", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const revelarBtns = screen.getAllByRole("button", { name: /revelar/i });
    fireEvent.click(revelarBtns[0]);
    await waitFor(() => {
      expect(revelarVariableAction).toHaveBeenCalledWith("v1");
      expect(screen.getByText("postgres://secret")).toBeInTheDocument();
    });
  });
});

describe("VariablesPanel — eliminar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra confirmación antes de eliminar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
    expect(eliminarVariableAction).not.toHaveBeenCalled();
  });

  it("cancela la eliminación al pulsar cancelar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(eliminarVariableAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /confirmar/i }),
    ).not.toBeInTheDocument();
  });

  it("llama a eliminarVariableAction al confirmar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => {
      expect(eliminarVariableAction).toHaveBeenCalledWith("v1");
    });
  });
});

describe("VariablesPanel — editar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra input de edición al pulsar editar", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const editarBtns = screen.getAllByRole("button", { name: /editar/i });
    fireEvent.click(editarBtns[0]);
    expect(
      screen.getByRole("textbox", { name: /nuevo valor/i }),
    ).toBeInTheDocument();
  });

  it("llama a actualizarVariableAction al guardar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const editarBtns = screen.getAllByRole("button", { name: /editar/i });
    fireEvent.click(editarBtns[0]);
    const input = screen.getByRole("textbox", { name: /nuevo valor/i });
    fireEvent.change(input, { target: { value: "nuevo-valor" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(actualizarVariableAction).toHaveBeenCalledWith(
        "v1",
        "nuevo-valor",
      );
    });
  });
});

describe("VariablesPanel — añadir variable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra formulario al pulsar Añadir variable", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir variable/i }));
    expect(screen.getByRole("textbox", { name: /clave/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /valor/i })).toBeInTheDocument();
  });

  it("llama a crearVariableAction con los datos del formulario", async () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir variable/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /clave/i }), {
      target: { value: "API_KEY" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /valor/i }), {
      target: { value: "mi-api-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(crearVariableAction).toHaveBeenCalledWith(
        "p1",
        "API_KEY",
        "mi-api-key",
        false,
      );
    });
  });
});
