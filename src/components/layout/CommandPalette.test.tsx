// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { CommandPalette } from "./CommandPalette";

const proyectos = [
  {
    id: "p1",
    nombre: "crm",
    cliente: "microcapilar",
    estado: "deploying" as const,
    dominio: "crm.microcapilar.es",
  },
  {
    id: "p2",
    nombre: "dp",
    cliente: "microcapilar",
    estado: "running" as const,
    dominio: null,
  },
  {
    id: "p3",
    nombre: "web",
    cliente: "acme",
    estado: "error" as const,
    dominio: "acme.com",
  },
];

beforeEach(() => vi.clearAllMocks());

async function abrir() {
  await userEvent.click(screen.getByRole("button", { name: /buscar/i }));
  return screen.getByRole("combobox", { name: /buscar proyecto o página/i });
}

describe("CommandPalette", () => {
  it("está cerrada al inicio y se abre con el botón Buscar", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const input = await abrir();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("se abre con Ctrl+K", async () => {
    render(<CommandPalette proyectos={proyectos} />);

    await userEvent.keyboard("{Control>}k{/Control}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("filtra por nombre, cliente o dominio", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    const input = await abrir();

    await userEvent.type(input, "acme");

    const opciones = screen.getAllByRole("option");
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toHaveTextContent("acme / web");
  });

  it("muestra también las páginas del panel", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    const input = await abrir();

    await userEvent.type(input, "config");

    expect(
      screen.getByRole("option", { name: /configuración/i }),
    ).toBeInTheDocument();
  });

  it("Enter abre la opción seleccionada y las flechas cambian la selección", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    const input = await abrir();

    await userEvent.type(input, "microcapilar");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/proyectos/p2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ArrowUp no baja de la primera opción", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    const input = await abrir();

    await userEvent.type(input, "microcapilar");
    await userEvent.keyboard("{ArrowUp}{Enter}");

    expect(mockPush).toHaveBeenCalledWith("/proyectos/p1");
  });

  it("al hacer clic en una opción navega a ella", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    await abrir();

    await userEvent.click(screen.getByRole("option", { name: /acme \/ web/i }));

    expect(mockPush).toHaveBeenCalledWith("/proyectos/p3");
  });

  it("Escape cierra la paleta", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    await abrir();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("indica cuando no hay resultados", async () => {
    render(<CommandPalette proyectos={proyectos} />);
    const input = await abrir();

    await userEvent.type(input, "zzz");

    expect(screen.getByText(/sin resultados/i)).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(mockPush).not.toHaveBeenCalled();
  });
});
