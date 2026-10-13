// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGuardar } = vi.hoisted(() => ({ mockGuardar: vi.fn() }));
vi.mock("@/app/(panel)/actions", () => ({
  guardarConfiguracionDeploysAction: mockGuardar,
}));

import { ConfiguracionDeploys } from "./ConfiguracionDeploys";
import { ToastProvider } from "@/components/ui/Toast";

function renderizar(timeoutMinutos = 30) {
  return render(
    <ToastProvider>
      <ConfiguracionDeploys timeoutMinutos={timeoutMinutos} />
    </ToastProvider>,
  );
}

describe("ConfiguracionDeploys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardar.mockResolvedValue(undefined);
  });

  it("muestra el timeout actual", () => {
    renderizar(45);
    expect(screen.getByLabelText("Tiempo máximo de deploy (min)")).toHaveValue(
      45,
    );
  });

  it("guarda el nuevo timeout y lo confirma", async () => {
    const user = userEvent.setup();
    renderizar();

    const campo = screen.getByLabelText("Tiempo máximo de deploy (min)");
    await user.clear(campo);
    await user.type(campo, "60");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(mockGuardar).toHaveBeenCalledWith(60);
    expect(
      await screen.findByText("Configuración guardada"),
    ).toBeInTheDocument();
  });

  it("muestra el error si el servidor rechaza el valor", async () => {
    const user = userEvent.setup();
    mockGuardar.mockResolvedValue({
      error: "El timeout debe ser 0 (sin límite) o entre 5 y 180 minutos",
    });
    renderizar();

    const campo = screen.getByLabelText("Tiempo máximo de deploy (min)");
    await user.clear(campo);
    await user.type(campo, "3");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "El timeout debe ser 0 (sin límite) o entre 5 y 180 minutos",
      ),
    ).toBeInTheDocument();
  });
});
