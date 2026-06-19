// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  logoutAction: vi.fn(),
  iniciarAction: vi.fn().mockResolvedValue(undefined),
  detenerAction: vi.fn().mockResolvedValue(undefined),
  restartAction: vi.fn().mockResolvedValue(undefined),
  eliminarProyectoAction: vi.fn().mockResolvedValue(undefined),
  deployProyectoAction: vi.fn().mockResolvedValue(undefined),
  toggleAutoDeployAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/hooks/useContainerLogs", () => ({
  useContainerLogs: vi.fn().mockReturnValue({
    lines: [],
    connected: false,
    error: null,
    sinContenedores: false,
    clear: vi.fn(),
  }),
}));

vi.mock("./ProyectoForm", () => ({
  ProyectoFormModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="proyecto-form-modal">
      <button onClick={onClose}>Cerrar</button>
    </div>
  ),
}));

import {
  iniciarAction,
  detenerAction,
  restartAction,
  eliminarProyectoAction,
  deployProyectoAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";

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

  it("muestra botón URL con https:// cuando sslActivo es true", () => {
    render(<ProjectCard proyecto={{ ...base, sslActivo: true }} />);
    const link = screen.getByTitle("Abrir en el navegador");
    expect(link).toHaveAttribute("href", "https://app.cliente-uno.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("muestra botón URL con http:// cuando sslActivo es false", () => {
    render(<ProjectCard proyecto={{ ...base, sslActivo: false }} />);
    const link = screen.getByTitle("Abrir en el navegador");
    expect(link).toHaveAttribute("href", "http://app.cliente-uno.com");
  });

  it("no muestra botón URL si no hay dominio", () => {
    render(
      <ProjectCard proyecto={{ ...base, dominio: null, sslActivo: null }} />,
    );
    expect(
      screen.queryByTitle("Abrir en el navegador"),
    ).not.toBeInTheDocument();
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

  it("al hacer click en Stop, el proyecto pasa a estado deploying visual", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    const stopBtn = screen.getByRole("button", { name: /stop/i });
    fireEvent.click(stopBtn);
    // After click, loading=true → isDeploying=true → only Deploying... button shown
    expect(screen.getByRole("button", { name: /deploying/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
  });

  it("al hacer click en Deploy, el botón se deshabilita mientras carga", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    const deployBtn = screen.getByRole("button", { name: /deploy/i });
    fireEvent.click(deployBtn);
    expect(screen.getByRole("button", { name: /deploying/i })).toBeDisabled();
  });

  it("al hacer click en Start, el proyecto pasa a estado deploying visual", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    const startBtn = screen.getByRole("button", { name: /^start$/i });
    fireEvent.click(startBtn);
    expect(screen.getByRole("button", { name: /deploying/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /^start$/i }),
    ).not.toBeInTheDocument();
  });

  it("al hacer click en Restart, el proyecto pasa a estado deploying visual", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    const restartBtn = screen.getByRole("button", { name: /restart/i });
    fireEvent.click(restartBtn);
    expect(screen.getByRole("button", { name: /deploying/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /restart/i }),
    ).not.toBeInTheDocument();
  });

  it("al hacer click en Start en estado error, el proyecto pasa a deploying visual", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "error" }} />);
    const startBtn = screen.getByRole("button", { name: /^start$/i });
    fireEvent.click(startBtn);
    expect(screen.getByRole("button", { name: /deploying/i })).toBeDisabled();
  });
});

describe("ProjectCard — mutaciones tRPC", () => {
  it("llama iniciarAction con el id del proyecto al hacer click en Start", async () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    await waitFor(() => expect(iniciarAction).toHaveBeenCalledWith("p1"));
  });

  it("llama detenerAction con el id del proyecto al hacer click en Stop", async () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(detenerAction).toHaveBeenCalledWith("p1"));
  });

  it("muestra mensaje de error cuando iniciarAction falla", async () => {
    vi.mocked(iniciarAction).mockResolvedValueOnce({
      error: "Container not found",
    });
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    await waitFor(() =>
      expect(screen.getByText(/Container not found/)).toBeInTheDocument(),
    );
  });

  it("muestra mensaje de error cuando detenerAction falla", async () => {
    vi.mocked(detenerAction).mockResolvedValueOnce({ error: "Docker error" });
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() =>
      expect(screen.getByText(/Docker error/)).toBeInTheDocument(),
    );
  });

  it("llama restartAction con el id del proyecto al hacer click en Restart", async () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    await waitFor(() => expect(restartAction).toHaveBeenCalledWith("p1"));
  });

  it("muestra mensaje de error cuando restartAction falla", async () => {
    vi.mocked(restartAction).mockResolvedValueOnce({ error: "Restart failed" });
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    await waitFor(() =>
      expect(screen.getByText(/Restart failed/)).toBeInTheDocument(),
    );
  });
});

describe("ProjectCard — editar y eliminar proyecto", () => {
  it("stopped: muestra botones Editar y Eliminar", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eliminar/i }),
    ).toBeInTheDocument();
  });

  it("running: muestra botones Editar y Eliminar (patrón Coolify)", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eliminar/i }),
    ).toBeInTheDocument();
  });

  it("click en Editar abre el modal de edición", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByTestId("proyecto-form-modal")).toBeInTheDocument();
  });

  it("click en Eliminar muestra confirmación inline", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    expect(screen.getByText(/¿Eliminar\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^sí$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^no$/i })).toBeInTheDocument();
  });

  it("confirmar eliminar llama eliminarProyectoAction con el id del proyecto", async () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: /^sí$/i }));
    await waitFor(() => {
      expect(eliminarProyectoAction).toHaveBeenCalledWith("p1");
    });
  });

  it("click en No cancela la confirmación de eliminar", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: /^no$/i }));
    expect(screen.queryByText(/¿Eliminar\?/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /eliminar/i }),
    ).toBeInTheDocument();
  });
});

describe("ProjectCard — deploy y auto-deploy", () => {
  it("llama deployProyectoAction con el id al hacer click en Deploy", async () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^deploy$/i }));
    await waitFor(() =>
      expect(deployProyectoAction).toHaveBeenCalledWith("p1"),
    );
  });

  it("muestra error cuando deployProyectoAction falla", async () => {
    vi.mocked(deployProyectoAction).mockResolvedValueOnce({
      error: "Sin repositorio configurado",
    });
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    fireEvent.click(screen.getByRole("button", { name: /^deploy$/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Sin repositorio configurado/),
      ).toBeInTheDocument(),
    );
  });

  it("muestra el toggle de auto-deploy", () => {
    render(<ProjectCard proyecto={base} />);
    expect(
      screen.getByRole("checkbox", { name: /auto-deploy/i }),
    ).toBeInTheDocument();
  });

  it("toggle auto-deploy desactivado cuando autoDeployHabilitado es false", () => {
    render(<ProjectCard proyecto={{ ...base, autoDeployHabilitado: false }} />);
    expect(
      screen.getByRole("checkbox", { name: /auto-deploy/i }),
    ).not.toBeChecked();
  });

  it("toggle auto-deploy activado cuando autoDeployHabilitado es true", () => {
    render(<ProjectCard proyecto={{ ...base, autoDeployHabilitado: true }} />);
    expect(
      screen.getByRole("checkbox", { name: /auto-deploy/i }),
    ).toBeChecked();
  });

  it("llama toggleAutoDeployAction al hacer click en el toggle", async () => {
    render(<ProjectCard proyecto={base} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /auto-deploy/i }));
    await waitFor(() =>
      expect(toggleAutoDeployAction).toHaveBeenCalledWith("p1"),
    );
  });
});
