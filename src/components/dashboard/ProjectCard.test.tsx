// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

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
      <div data-testid="logs-modal" aria-label={`Logs de ${proyectoNombre}`}>
        <button onClick={onClose}>Cerrar</button>
      </div>
    ) : null,
}));

const base: ProyectoResumen = {
  id: "p1",
  nombre: "web-app",
  clienteSlug: "cliente-uno",
  estado: "running",
  dominio: "app.cliente-uno.com",
  repositorioUrl: "https://github.com/org/web-app",
  rama: "main",
  autoDeployHabilitado: false,
  sslActivo: true,
  tipo: "compose",
  puerto: null,
  imagenUrl: null,
  dockerfilePath: null,
  buildCommand: null,
  startCommand: null,
  ultimoDeploy: { hace: "hace 2h", rama: "main" },
};

describe("ProjectCard — contenido", () => {
  it("muestra el nombre del proyecto", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    expect(screen.getByText("web-app")).toBeInTheDocument();
  });

  it("muestra el nombre del cliente", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
  });

  it("muestra el dominio cuando existe", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    expect(screen.getByText("app.cliente-uno.com")).toBeInTheDocument();
  });

  it("muestra 'sin dominio' cuando no hay dominio", () => {
    render(
      <ProjectCard
        p={{ ...base, dominio: null, sslActivo: null }}
        clienteNombre="Cliente Uno"
      />,
    );
    expect(screen.getByText(/sin dominio/)).toBeInTheDocument();
  });

  it("no muestra el dominio si es null", () => {
    render(
      <ProjectCard
        p={{ ...base, dominio: null }}
        clienteNombre="Cliente Uno"
      />,
    );
    expect(screen.queryByText("app.cliente-uno.com")).not.toBeInTheDocument();
  });

  it("muestra rama y tiempo del último deploy", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    expect(screen.getByText(/hace 2h/)).toBeInTheDocument();
    expect(screen.getByText(/main/)).toBeInTheDocument();
  });

  it("muestra 'sin deploys' cuando no hay deploy previo", () => {
    render(
      <ProjectCard
        p={{ ...base, ultimoDeploy: null }}
        clienteNombre="Cliente Uno"
      />,
    );
    expect(screen.getByText(/sin deploys/)).toBeInTheDocument();
  });
});

describe("ProjectCard — acciones", () => {
  it("el enlace Ver apunta al detalle del proyecto", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    const verLink = screen.getByRole("link", { name: /ver/i });
    expect(verLink).toHaveAttribute("href", "/proyectos/p1");
  });

  it("el botón Logs abre el modal de logs", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    expect(screen.queryByTestId("logs-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /logs/i }));
    expect(screen.getByTestId("logs-modal")).toBeInTheDocument();
  });

  it("cerrar el modal de logs lo oculta", () => {
    render(<ProjectCard p={base} clienteNombre="Cliente Uno" />);
    fireEvent.click(screen.getByRole("button", { name: /logs/i }));
    expect(screen.getByTestId("logs-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByTestId("logs-modal")).not.toBeInTheDocument();
  });
});
