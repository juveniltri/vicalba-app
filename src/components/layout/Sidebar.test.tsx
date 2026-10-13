// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/(panel)/actions", () => ({
  logoutAction: vi.fn(),
}));

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: string;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { Sidebar } from "@/components/layout/Sidebar";

const proyectos = [
  {
    id: "p1",
    nombre: "crm",
    cliente: "microcapilar",
    clienteSlug: "microcapilar",
    estado: "deploying" as const,
    dominio: null,
  },
  {
    id: "p2",
    nombre: "dp",
    cliente: "microcapilar",
    clienteSlug: "microcapilar",
    estado: "running" as const,
    dominio: null,
  },
];
const usuario = { nombre: "Victor Ramos", email: "victor@ejemplo.com" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Sidebar", () => {
  it("renderiza el nombre de la aplicación", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(screen.getByText("vicalba")).toBeInTheDocument();
  });

  it("renderiza el enlace Dashboard", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renderiza el enlace Proyectos", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByRole("link", { name: /^Proyectos/ }),
    ).toBeInTheDocument();
  });

  it("renderiza el enlace Configuración", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByRole("link", { name: "Configuración" }),
    ).toBeInTheDocument();
  });

  it("el nav tiene el label de navegación principal", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByRole("navigation", { name: "navegación principal" }),
    ).toBeInTheDocument();
  });

  it("muestra el botón de cambio de tema", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByRole("button", { name: /activar modo claro/i }),
    ).toBeInTheDocument();
  });

  it("muestra el número de proyectos junto a Proyectos", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(screen.getByRole("link", { name: /^Proyectos/ })).toHaveTextContent(
      "2",
    );
  });

  it("lista los proyectos fijados con enlace a su página", () => {
    localStorage.setItem("vicalba:fijados", JSON.stringify(["p2"]));
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);

    const fijados = screen.getByRole("list", { name: "Fijados" });
    expect(fijados).toHaveTextContent("microcapilar / dp");
    expect(
      screen.getByRole("link", { name: /microcapilar \/ dp/ }),
    ).toHaveAttribute("href", "/proyectos/p2");
  });

  it("explica cómo fijar cuando no hay ninguno", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByText(/fija proyectos desde su página/i),
    ).toBeInTheDocument();
  });

  it("ignora fijados de proyectos que ya no existen", () => {
    localStorage.setItem("vicalba:fijados", JSON.stringify(["borrado"]));
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(
      screen.getByText(/fija proyectos desde su página/i),
    ).toBeInTheDocument();
  });

  it("muestra el usuario con sus iniciales", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(screen.getByText("Victor Ramos")).toBeInTheDocument();
    expect(screen.getByText("VR")).toBeInTheDocument();
  });

  it("usa el email si el usuario no tiene nombre", () => {
    render(
      <Sidebar
        proyectos={proyectos}
        usuario={{ nombre: null, email: "ops@x.com" }}
      />,
    );
    expect(screen.getByText("ops@x.com")).toBeInTheDocument();
    expect(screen.getByText("O")).toBeInTheDocument();
  });

  it("incluye la búsqueda", () => {
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    expect(screen.getByRole("button", { name: /buscar/i })).toBeInTheDocument();
  });

  it("en móvil el menú se pliega y se despliega con su botón", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(<Sidebar proyectos={proyectos} usuario={usuario} />);
    const boton = screen.getByRole("button", { name: "Menú" });
    const panel = document.getElementById(boton.getAttribute("aria-controls")!);

    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveClass("hidden");

    await userEvent.click(boton);

    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveClass("hidden");
  });
});
