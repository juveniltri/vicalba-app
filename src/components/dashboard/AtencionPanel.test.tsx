// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/app/(panel)/actions", () => ({
  rollbackAction: vi.fn().mockResolvedValue(undefined),
}));

import { rollbackAction } from "@/app/(panel)/actions";
import { AtencionPanel } from "./AtencionPanel";
import type { ProyectoAtencion } from "@/lib/schemas/dashboard";

const enError: ProyectoAtencion = {
  id: "p9",
  nombre: "api",
  cliente: "acme",
  estado: "error",
  deployId: "d9",
  sha: "7b02d4e9ff",
  rama: "main",
  origen: "manual",
  hace: "hace 14m",
  lineas: ["#2 npm ci", "exit code 1"],
  rollback: { deployId: "d5", sha: "a3f9c21ffab" },
};

const desplegando: ProyectoAtencion = {
  id: "p1",
  nombre: "crm",
  cliente: "microcapilar",
  estado: "deploying",
  deployId: "d1",
  sha: null,
  rama: "main",
  origen: "webhook",
  hace: "hace 0m",
  lineas: ["#12 RUN npm run build"],
  rollback: null,
};

beforeEach(() => vi.clearAllMocks());

describe("AtencionPanel", () => {
  it("indica que todo está en orden si no hay proyectos en atención", () => {
    render(<AtencionPanel proyectos={[]} />);
    expect(screen.getByText(/todo en orden/i)).toBeInTheDocument();
  });

  it("muestra el proyecto en error con el final de su log", () => {
    render(<AtencionPanel proyectos={[enError]} />);

    expect(screen.getByText("acme / api")).toBeInTheDocument();
    expect(screen.getByText(/exit code 1/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ver log del deploy/i }),
    ).toHaveAttribute("href", "/proyectos/p9?tab=deploys");
  });

  it("el rollback vuelve al último commit correcto", async () => {
    render(<AtencionPanel proyectos={[enError]} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Rollback a a3f9c21" }),
    );

    expect(rollbackAction).toHaveBeenCalledWith("d5");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("muestra el error si el rollback falla", async () => {
    vi.mocked(rollbackAction).mockResolvedValueOnce({
      error: "Ya desplegando",
    });
    render(<AtencionPanel proyectos={[enError]} />);

    await userEvent.click(screen.getByRole("button", { name: /rollback/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya desplegando",
    );
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("no ofrece rollback si no hay un deploy correcto previo", () => {
    render(<AtencionPanel proyectos={[{ ...enError, rollback: null }]} />);
    expect(
      screen.queryByRole("button", { name: /rollback/i }),
    ).not.toBeInTheDocument();
  });

  it("para un deploy en curso enlaza a seguirlo en vivo", () => {
    render(<AtencionPanel proyectos={[desplegando]} />);

    expect(screen.getByText(/main · webhook/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /seguir en vivo/i }),
    ).toHaveAttribute("href", "/proyectos/p1");
  });

  it("cuenta los proyectos en atención", () => {
    render(<AtencionPanel proyectos={[enError, desplegando]} />);
    expect(screen.getByText("2 proyectos")).toBeInTheDocument();
  });
});
