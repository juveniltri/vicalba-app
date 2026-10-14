// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { restaurarBackupAction, refresh } = vi.hoisted(() => ({
  restaurarBackupAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => ({ restaurarBackupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { CopiasBackup } from "./CopiasBackup";
import { ToastProvider } from "@/components/ui/Toast";

const copia = {
  id: "abc12345",
  fecha: new Date("2026-10-14T01:00:00Z"),
  bytes: 2048,
};

function renderizar(copias: Parameters<typeof CopiasBackup>[0]["copias"]) {
  return render(
    <ToastProvider>
      <CopiasBackup copias={copias} />
    </ToastProvider>,
  );
}

describe("CopiasBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restaurarBackupAction.mockResolvedValue({ id: "r1" });
  });

  it("muestra el error del destino en lugar de la lista", () => {
    renderizar({ error: "403 Forbidden" });
    expect(screen.getByRole("alert")).toHaveTextContent("403 Forbidden");
  });

  it("sin copias lo indica", () => {
    renderizar([]);
    expect(
      screen.getByText("El destino aún no tiene copias"),
    ).toBeInTheDocument();
  });

  it("lista fecha y tamaño de cada copia", () => {
    renderizar([copia, { id: "def67890", fecha: new Date(), bytes: null }]);
    expect(screen.getByText("14/10/26, 3:00")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("restaurar exige escribir RESTAURAR y avisa al terminar", async () => {
    const user = userEvent.setup();
    renderizar([copia]);
    await user.click(screen.getByRole("button", { name: "Restaurar" }));

    const aviso = screen.getByRole("dialog");
    expect(aviso).toHaveTextContent(
      "El Panel volverá al estado del 14/10/26, 3:00: Proyectos, variables, usuarios, credenciales e historial de deploys. Se perderán los cambios hechos desde entonces. Los contenedores en marcha no se tocan. Antes se hará una copia automática para poder deshacerlo.",
    );
    const confirmar = screen.getByRole("button", { name: "Restaurar copia" });
    expect(confirmar).toBeDisabled();
    const campo = screen.getByLabelText("Escribe RESTAURAR para confirmar");
    await user.type(campo, "restaurar");
    expect(confirmar).toBeDisabled();
    await user.clear(campo);
    await user.type(campo, "RESTAURAR");
    await user.click(confirmar);

    expect(restaurarBackupAction).toHaveBeenCalledWith("abc12345", "RESTAURAR");
    expect(
      await screen.findByText("Restauración iniciada"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("un error de la restauración se muestra en el aviso", async () => {
    const user = userEvent.setup();
    restaurarBackupAction.mockResolvedValue({
      error: "Ya hay una copia o restauración en curso",
    });
    renderizar([copia]);
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await user.type(
      screen.getByLabelText("Escribe RESTAURAR para confirmar"),
      "RESTAURAR",
    );
    await user.click(screen.getByRole("button", { name: "Restaurar copia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay una copia o restauración en curso",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelar cierra el aviso sin restaurar", async () => {
    const user = userEvent.setup();
    renderizar([copia]);
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(restaurarBackupAction).not.toHaveBeenCalled();
  });
});
