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
}));

import { iniciarAction, detenerAction } from "@/app/(panel)/actions";

const base: ProyectoResumen = {
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
});
