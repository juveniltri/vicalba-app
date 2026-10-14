// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { confirmarClaveBackupAction } = vi.hoisted(() => ({
  confirmarClaveBackupAction: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => ({ confirmarClaveBackupAction }));

import { KitRecuperacionModal } from "./KitRecuperacionModal";

const onConfirmado = vi.fn();

describe("KitRecuperacionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmarClaveBackupAction.mockResolvedValue(undefined);
  });

  it("muestra el kit", () => {
    render(
      <KitRecuperacionModal
        kit="Clave:        K"
        onConfirmado={onConfirmado}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Clave: K");
  });

  it("no deja continuar hasta marcar que el kit está guardado", async () => {
    render(
      <KitRecuperacionModal
        kit={"Clave:        K"}
        onConfirmado={onConfirmado}
      />,
    );
    const continuar = screen.getByRole("button", { name: "Continuar" });
    expect(continuar).toBeDisabled();
    await userEvent.click(
      screen.getByLabelText("He guardado el kit fuera de la VPS"),
    );
    await userEvent.click(continuar);
    expect(confirmarClaveBackupAction).toHaveBeenCalled();
    expect(onConfirmado).toHaveBeenCalled();
  });

  it("copia el kit al portapapeles", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<KitRecuperacionModal kit="KIT" onConfirmado={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copiar" }));
    expect(writeText).toHaveBeenCalledWith("KIT");
    expect(
      await screen.findByRole("button", { name: "Copiado" }),
    ).toBeInTheDocument();
  });

  it("si no se puede confirmar, muestra el error y no continúa", async () => {
    confirmarClaveBackupAction.mockResolvedValue({
      error: "No se pudo confirmar",
    });
    render(<KitRecuperacionModal kit="KIT" onConfirmado={onConfirmado} />);
    await userEvent.click(
      screen.getByLabelText("He guardado el kit fuera de la VPS"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo confirmar",
    );
    expect(onConfirmado).not.toHaveBeenCalled();
  });
});
