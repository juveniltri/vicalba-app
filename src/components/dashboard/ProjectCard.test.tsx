// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import type { Proyecto } from "@/lib/mock-data";

const base: Proyecto = {
  id: "p1",
  nombre: "web-app",
  clienteSlug: "cliente-uno",
  estado: "running",
  servicios: [],
  dominio: "app.cliente-uno.com",
  ultimoDeploy: { hace: "hace 2h", rama: "main" },
};

describe("ProjectCard — contenido", () => {
  it("muestra el nombre del proyecto", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText("web-app")).toBeInTheDocument();
  });

  it("muestra el dominio cuando existe", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText("app.cliente-uno.com")).toBeInTheDocument();
  });

  it("muestra rama y tiempo del último deploy", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText(/main/)).toBeInTheDocument();
    expect(screen.getByText(/hace 2h/)).toBeInTheDocument();
  });

  it("no muestra dominio si es null", () => {
    render(<ProjectCard proyecto={{ ...base, dominio: null }} />);
    expect(screen.queryByText("app.cliente-uno.com")).not.toBeInTheDocument();
  });
});

describe("ProjectCard — acciones según estado", () => {
  it("running: muestra Stop, Restart y Deploy habilitados", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /^start$/i }),
    ).not.toBeInTheDocument();
  });

  it("stopped: muestra Start y Deploy, sin Stop ni Restart", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /restart/i }),
    ).not.toBeInTheDocument();
  });

  it("error: muestra Start, Restart y Deploy", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "error" }} />);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
  });

  it("deploying: muestra solo el botón Deploy deshabilitado, sin otras acciones", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "deploying" }} />);
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /restart/i }),
    ).not.toBeInTheDocument();
    const deployBtn = screen.getByRole("button", { name: /deploying/i });
    expect(deployBtn).toBeDisabled();
  });
});
