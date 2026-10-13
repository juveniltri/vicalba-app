// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectActionButton } from "./ProjectActionButton";
import { ToastProvider } from "@/components/ui/Toast";

function renderButton(action: () => Promise<{ error: string } | undefined>) {
  return render(
    <ToastProvider>
      <ProjectActionButton
        action={action}
        label="Iniciar"
        pendingLabel="Iniciando…"
        successMessage="Proyecto iniciado"
        className="btn"
      >
        <span>icon</span>
      </ProjectActionButton>
    </ToastProvider>,
  );
}

describe("ProjectActionButton", () => {
  it("muestra el label y pasa a pendingLabel mientras la acción está en curso", async () => {
    const user = userEvent.setup();
    let resolveAction: (v: undefined) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveAction = resolve;
        }),
    );
    renderButton(action);

    expect(
      screen.getByRole("button", { name: /icon Iniciar/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("Iniciando…")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    resolveAction(undefined);

    await waitFor(() =>
      expect(screen.getByText("Iniciar")).toBeInTheDocument(),
    );
    expect(await screen.findByText("Proyecto iniciado")).toBeInTheDocument();
  });

  it("muestra un toast de error cuando la acción devuelve { error }", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ error: "Fallo al iniciar" });
    renderButton(action);

    await user.click(screen.getByRole("button"));

    expect(await screen.findByText("Fallo al iniciar")).toBeInTheDocument();
  });

  it("respeta la prop disabled", () => {
    render(
      <ToastProvider>
        <ProjectActionButton
          action={vi.fn()}
          label="Detener"
          pendingLabel="Deteniendo…"
          successMessage="Proyecto detenido"
          disabled
          className="btn"
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: "Detener" })).toBeDisabled();
  });

  it("con confirmLabel pide confirmación y solo ejecuta en el segundo clic", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <ProjectActionButton
          action={action}
          label="Cancelar deploy"
          pendingLabel="Cancelando…"
          confirmLabel="¿Cancelar el deploy?"
          successMessage="Deploy cancelado"
          className="btn"
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar deploy" }));
    expect(action).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "¿Cancelar el deploy?" }),
    );
    expect(action).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Deploy cancelado")).toBeInTheDocument();
  });

  it("la confirmación se descarta al salir del botón", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue(undefined);
    render(
      <ToastProvider>
        <ProjectActionButton
          action={action}
          label="Cancelar deploy"
          pendingLabel="Cancelando…"
          confirmLabel="¿Cancelar el deploy?"
          successMessage="Deploy cancelado"
          className="btn"
        />
        <button type="button">otro</button>
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar deploy" }));
    await user.click(screen.getByRole("button", { name: "otro" }));

    expect(
      screen.getByRole("button", { name: "Cancelar deploy" }),
    ).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
