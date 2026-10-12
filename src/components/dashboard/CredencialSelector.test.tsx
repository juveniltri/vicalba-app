// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CredencialSelector } from "./CredencialSelector";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  asignarCredencialAction: vi.fn().mockResolvedValue(undefined),
}));

import { asignarCredencialAction } from "@/app/(panel)/actions";

const credencialesBase = [
  { id: "c1", nombre: "GitHub producción" },
  { id: "c2", nombre: "GitLab staging" },
];

describe("CredencialSelector — renderizado", () => {
  it("muestra el selector con opción Sin credencial", async () => {
    const user = userEvent.setup();
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId={null}
        credenciales={credencialesBase}
      />,
    );
    await user.click(screen.getByRole("button", { name: /credencial ssh/i }));
    expect(
      screen.getByRole("option", { name: "Sin credencial" }),
    ).toBeInTheDocument();
  });

  it("muestra todas las credenciales disponibles", async () => {
    const user = userEvent.setup();
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId={null}
        credenciales={credencialesBase}
      />,
    );
    await user.click(screen.getByRole("button", { name: /credencial ssh/i }));
    expect(
      screen.getByRole("option", { name: "GitHub producción" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "GitLab staging" }),
    ).toBeInTheDocument();
  });

  it("preselecciona la credencial actual", () => {
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId="c2"
        credenciales={credencialesBase}
      />,
    );
    expect(
      screen.getByRole("button", { name: /credencial ssh/i }),
    ).toHaveTextContent("GitLab staging");
  });

  it("muestra enlace a configuración si no hay credenciales", () => {
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId={null}
        credenciales={[]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /configuración/i }),
    ).toBeInTheDocument();
  });
});

describe("CredencialSelector — guardar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("llama a asignarCredencialAction con la credencial seleccionada", async () => {
    const user = userEvent.setup();
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId={null}
        credenciales={credencialesBase}
      />,
    );
    await user.click(screen.getByRole("button", { name: /credencial ssh/i }));
    await user.click(screen.getByRole("option", { name: "GitHub producción" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(asignarCredencialAction).toHaveBeenCalledWith("p1", "c1");
    });
  });

  it("llama a asignarCredencialAction con null al seleccionar Sin credencial", async () => {
    const user = userEvent.setup();
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId="c1"
        credenciales={credencialesBase}
      />,
    );
    await user.click(screen.getByRole("button", { name: /credencial ssh/i }));
    await user.click(screen.getByRole("option", { name: "Sin credencial" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(asignarCredencialAction).toHaveBeenCalledWith("p1", null);
    });
  });

  it("muestra error si asignarCredencialAction falla", async () => {
    vi.mocked(asignarCredencialAction).mockResolvedValueOnce({
      error: "Proyecto no encontrado",
    });
    render(
      <CredencialSelector
        proyectoId="p1"
        credencialActualId={null}
        credenciales={credencialesBase}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Proyecto no encontrado",
      );
    });
  });
});
