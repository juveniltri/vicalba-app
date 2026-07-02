// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VariablesPanel } from "./VariablesPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
  loader: { config: vi.fn() },
}));

vi.mock("next/dynamic", () => ({
  default: (fn: () => Promise<{ default: unknown }>) => {
    let Comp: React.ComponentType | null = null;
    fn().then((m) => {
      Comp = m.default as React.ComponentType;
    });
    return function DynamicWrapper(props: Record<string, unknown>) {
      if (!Comp) return null;
      return <Comp {...props} />;
    };
  },
}));

vi.mock("@/app/(panel)/actions", () => ({
  cargarVariablesAction: vi
    .fn()
    .mockResolvedValue({
      contenido: "DATABASE_URL=postgres://secret\nJWT_SECRET=abc123",
    }),
  sincronizarVariablesAction: vi
    .fn()
    .mockResolvedValue({ guardadas: 2, eliminadas: 0, invalidas: [] }),
  eliminarVariableAction: vi.fn().mockResolvedValue(undefined),
  toggleBuildTimeAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  cargarVariablesAction,
  sincronizarVariablesAction,
  eliminarVariableAction,
  toggleBuildTimeAction,
} from "@/app/(panel)/actions";

const variablesBase = [
  { id: "v1", clave: "DATABASE_URL", enBuildTime: false, creadoEn: new Date() },
  { id: "v2", clave: "JWT_SECRET", enBuildTime: true, creadoEn: new Date() },
];

describe("VariablesPanel — lista", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra las claves enmascaradas en una línea por variable", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    expect(screen.getByText(/DATABASE_URL/)).toBeInTheDocument();
    expect(screen.getByText(/JWT_SECRET/)).toBeInTheDocument();
    const masks = screen.getAllByText("••••••••");
    expect(masks).toHaveLength(2);
  });

  it("muestra mensaje vacío si no hay variables", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    expect(screen.getByText(/sin variables/i)).toBeInTheDocument();
  });

  it("muestra el botón Editar variables", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    expect(
      screen.getByRole("button", { name: /editar variables/i }),
    ).toBeInTheDocument();
  });
});

describe("VariablesPanel — toggle build time", () => {
  beforeEach(() => vi.clearAllMocks());

  it("llama a toggleBuildTimeAction al cambiar el toggle", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const toggles = screen.getAllByRole("switch");
    fireEvent.click(toggles[0]);
    await waitFor(() => {
      expect(toggleBuildTimeAction).toHaveBeenCalledWith("v1", true);
    });
  });
});

describe("VariablesPanel — eliminar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra confirmación al pulsar ×", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const deleteBtns = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(deleteBtns[0]);
    expect(screen.getByText(/¿Eliminar\?/i)).toBeInTheDocument();
    expect(eliminarVariableAction).not.toHaveBeenCalled();
  });

  it("cancela la eliminación al pulsar No", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const deleteBtns = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(eliminarVariableAction).not.toHaveBeenCalled();
    expect(screen.queryByText(/¿Eliminar\?/i)).not.toBeInTheDocument();
  });

  it("llama a eliminarVariableAction al confirmar con Sí", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const deleteBtns = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(deleteBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: "Sí" }));
    await waitFor(() => {
      expect(eliminarVariableAction).toHaveBeenCalledWith("v1");
    });
  });
});

describe("VariablesPanel — editor Monaco", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abre el editor al pulsar Editar variables", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar variables/i }));
    await waitFor(() => {
      expect(cargarVariablesAction).toHaveBeenCalledWith("p1");
    });
  });

  it("llama a sincronizarVariablesAction al guardar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar variables/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /guardar variables/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /guardar variables/i }));
    await waitFor(() => {
      expect(sincronizarVariablesAction).toHaveBeenCalledWith(
        "p1",
        "DATABASE_URL=postgres://secret\nJWT_SECRET=abc123",
      );
    });
  });

  it("vuelve a la lista al pulsar Cancelar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar variables/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /cancelar/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(
      screen.getByRole("button", { name: /editar variables/i }),
    ).toBeInTheDocument();
  });

  it("muestra claves inválidas tras guardar", async () => {
    vi.mocked(sincronizarVariablesAction).mockResolvedValueOnce({
      guardadas: 1,
      eliminadas: 0,
      invalidas: ["lowercase_key"],
    });
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /editar variables/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /guardar variables/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /guardar variables/i }));
    await waitFor(() => {
      expect(screen.getByText(/lowercase_key/i)).toBeInTheDocument();
    });
  });
});
