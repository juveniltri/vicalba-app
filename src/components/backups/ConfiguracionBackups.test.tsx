// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({
  lanzarCopiaBackupAction: vi.fn(),
  obtenerKitBackupAction: vi.fn(),
  guardarProgramacionBackupAction: vi.fn(),
  confirmarClaveBackupAction: vi.fn(),
  guardarDestinoBackupAction: vi.fn(),
  restaurarBackupAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => a);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: a.refresh }),
}));

import { ConfiguracionBackups } from "./ConfiguracionBackups";
import { ToastProvider } from "@/components/ui/Toast";
import type {
  ConfiguracionBackupVista,
  EjecucionBackup,
} from "@/lib/schemas/dashboard";

const lista: ConfiguracionBackupVista = {
  habilitado: true,
  hora: 3,
  tipoDestino: "s3",
  s3: {
    endpoint: "https://s3.x",
    bucket: "b",
    region: null,
    prefijo: null,
    accessKeyId: "AK",
    tieneSecretKey: true,
  },
  sftp: {
    host: null,
    puerto: 22,
    usuario: null,
    ruta: null,
    credencialId: null,
  },
  tieneClave: true,
  claveConfirmada: true,
  repositorioInicializado: true,
  proximaCopia: new Date("2026-10-15T01:00:00Z"),
  enCurso: false,
};

const ejecucion = (e: Partial<EjecucionBackup>): EjecucionBackup => ({
  id: "b1",
  operacion: "copia",
  origen: "programado",
  resultado: "exito",
  iniciadoEn: new Date(Date.now() - 6 * 3_600_000),
  finalizadoEn: null,
  snapshotId: null,
  bytesAnadidos: null,
  error: null,
  ...e,
});

function renderizar(
  config = lista,
  historial: EjecucionBackup[] = [ejecucion({})],
) {
  return render(
    <ToastProvider>
      <ConfiguracionBackups
        config={config}
        credenciales={[]}
        historial={historial}
        copias={[]}
      />
    </ToastProvider>,
  );
}

describe("ConfiguracionBackups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    a.lanzarCopiaBackupAction.mockResolvedValue({ id: "b2" });
    a.guardarProgramacionBackupAction.mockResolvedValue(undefined);
    a.obtenerKitBackupAction.mockResolvedValue({ kit: "Clave:        K" });
    a.confirmarClaveBackupAction.mockResolvedValue(undefined);
  });

  it("muestra la última copia y la próxima", () => {
    renderizar();
    expect(screen.getByText("Última copia").nextSibling).toHaveTextContent(
      "hace 6h · correcta",
    );
    expect(screen.getByText("Próxima copia").nextSibling).toHaveTextContent(
      "15/10/26, 3:00",
    );
  });

  it("la última copia fallida muestra el motivo", () => {
    renderizar(lista, [
      ejecucion({ resultado: "error", error: "403 Forbidden" }),
    ]);
    expect(screen.getByText("Última copia").nextSibling).toHaveTextContent(
      "falló: 403 Forbidden",
    );
  });

  it("sin copias ni programación lo indica", () => {
    renderizar({ ...lista, habilitado: false, proximaCopia: null }, [
      ejecucion({ operacion: "restauracion" }),
    ]);
    expect(screen.getByText("Última copia").nextSibling).toHaveTextContent(
      "Ninguna",
    );
    expect(screen.getByText("Próxima copia").nextSibling).toHaveTextContent(
      "Backups desactivados",
    );
  });

  it("una copia en curso se indica", () => {
    renderizar(lista, [ejecucion({ resultado: "en_curso" })]);
    expect(screen.getByText("Última copia").nextSibling).toHaveTextContent(
      "en curso",
    );
  });

  it("«Hacer copia ahora» lanza la copia", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Hacer copia ahora" }));
    expect(a.lanzarCopiaBackupAction).toHaveBeenCalled();
    expect(await screen.findByText("Copia iniciada")).toBeInTheDocument();
    expect(a.refresh).toHaveBeenCalled();
  });

  it("un error al lanzar la copia se muestra", async () => {
    const user = userEvent.setup();
    a.lanzarCopiaBackupAction.mockResolvedValue({
      error: "Ya hay una copia o restauración en curso",
    });
    renderizar();
    await user.click(screen.getByRole("button", { name: "Hacer copia ahora" }));
    expect(
      await screen.findByText("Ya hay una copia o restauración en curso"),
    ).toBeInTheDocument();
  });

  it("con otra operación en curso no deja lanzar otra", () => {
    renderizar({ ...lista, enCurso: true });
    expect(
      screen.getByRole("button", { name: "Hacer copia ahora" }),
    ).toBeDisabled();
  });

  it("con la clave sin confirmar abre el kit de recuperación", async () => {
    const user = userEvent.setup();
    renderizar({ ...lista, claveConfirmada: false, habilitado: false });
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Clave: K");
    await user.click(
      screen.getByLabelText("He guardado el kit fuera de la VPS"),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(a.confirmarClaveBackupAction).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.refresh).toHaveBeenCalled();
  });

  it("si no se puede obtener el kit, lo dice", async () => {
    a.obtenerKitBackupAction.mockResolvedValue({ error: "Aún no hay clave" });
    renderizar({ ...lista, claveConfirmada: false });
    expect(await screen.findByText("Aún no hay clave")).toBeInTheDocument();
  });

  it("el interruptor activa la copia diaria a la hora elegida", async () => {
    const user = userEvent.setup();
    renderizar({ ...lista, habilitado: false });
    await user.click(screen.getByRole("switch", { name: "Copia diaria" }));
    expect(a.guardarProgramacionBackupAction).toHaveBeenCalledWith(true, 3);
    expect(
      await screen.findByText("Programación guardada"),
    ).toBeInTheDocument();
  });

  it("cambiar la hora la guarda", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: /hora de la copia/i }));
    await user.click(screen.getByRole("option", { name: "05:00" }));
    expect(a.guardarProgramacionBackupAction).toHaveBeenCalledWith(true, 5);
  });

  it("un error al guardar la programación se muestra y no cambia el interruptor", async () => {
    const user = userEvent.setup();
    a.guardarProgramacionBackupAction.mockResolvedValue({
      error: "Configura el destino",
    });
    renderizar({ ...lista, habilitado: false });
    const interruptor = screen.getByRole("switch", { name: "Copia diaria" });
    await user.click(interruptor);
    expect(await screen.findByText("Configura el destino")).toBeInTheDocument();
    expect(interruptor).toHaveAttribute("aria-checked", "false");
  });

  it("mientras hay una operación en curso se refresca sola hasta que acaba", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderizar({ ...lista, enCurso: true });
      vi.advanceTimersByTime(6000);
      expect(a.refresh).toHaveBeenCalledTimes(2);
      rerender(
        <ToastProvider>
          <ConfiguracionBackups
            config={lista}
            credenciales={[]}
            historial={[ejecucion({})]}
            copias={[]}
          />
        </ToastProvider>,
      );
      vi.advanceTimersByTime(6000);
      expect(a.refresh).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
