// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ClientSection", () => ({
  ClientSection: ({
    cliente,
  }: {
    cliente: { nombre: string; proyectos: Array<{ nombre: string }> };
  }) => (
    <section aria-label={cliente.nombre}>
      {cliente.proyectos.map((p) => (
        <span key={p.nombre}>{p.nombre}</span>
      ))}
    </section>
  ),
}));

import { ProyectosExplorer } from "./ProyectosExplorer";
import type { ClienteConProyectos } from "@/lib/schemas/dashboard";

function proyecto(
  id: string,
  nombre: string,
  estado: "running" | "stopped" | "error" | "deploying",
  extra: { dominio?: string | null; repositorioUrl?: string | null } = {},
) {
  return {
    id,
    nombre,
    estado,
    dominio: extra.dominio ?? null,
    repositorioUrl: extra.repositorioUrl ?? null,
  } as ClienteConProyectos["proyectos"][number];
}

const clientes = [
  {
    id: "c1",
    slug: "microcapilar",
    nombre: "microcapilar",
    proyectos: [
      proyecto("p1", "crm", "deploying", { dominio: "crm.microcapilar.es" }),
      proyecto("p2", "dp", "running", {
        repositorioUrl: "https://github.com/microcapilar/dp",
      }),
    ],
  },
  {
    id: "c2",
    slug: "acme",
    nombre: "acme",
    proyectos: [proyecto("p3", "web", "error")],
  },
  { id: "c3", slug: "vacio", nombre: "vacio", proyectos: [] },
] as ClienteConProyectos[];

describe("ProyectosExplorer", () => {
  it("muestra todos los clientes, también los que no tienen proyectos", () => {
    render(<ProyectosExplorer clientes={clientes} />);
    expect(
      screen.getByRole("region", { name: "microcapilar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "vacio" })).toBeInTheDocument();
  });

  it("los filtros muestran el número de proyectos por estado", () => {
    render(<ProyectosExplorer clientes={clientes} />);
    expect(screen.getByRole("button", { name: "Todos 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Error 1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stopped 0" }),
    ).toBeInTheDocument();
  });

  it("filtrar por estado oculta los clientes sin coincidencias", async () => {
    render(<ProyectosExplorer clientes={clientes} />);

    await userEvent.click(screen.getByRole("button", { name: "Error 1" }));

    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.queryByText("crm")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "vacio" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Error 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("busca por nombre, cliente, dominio o repositorio", async () => {
    render(<ProyectosExplorer clientes={clientes} />);
    const buscador = screen.getByRole("searchbox", {
      name: /filtrar proyectos/i,
    });

    await userEvent.type(buscador, "crm.micro");
    expect(screen.getByText("crm")).toBeInTheDocument();
    expect(screen.queryByText("dp")).not.toBeInTheDocument();

    await userEvent.clear(buscador);
    await userEvent.type(buscador, "github.com/microcapilar/dp");
    expect(screen.getByText("dp")).toBeInTheDocument();
    expect(screen.queryByText("crm")).not.toBeInTheDocument();

    await userEvent.clear(buscador);
    await userEvent.type(buscador, "ACME");
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("explica cuando ningún proyecto coincide", async () => {
    render(<ProyectosExplorer clientes={clientes} />);

    await userEvent.type(
      screen.getByRole("searchbox", { name: /filtrar proyectos/i }),
      "zzz",
    );

    expect(screen.getByText(/ningún proyecto coincide/i)).toBeInTheDocument();
  });
});
