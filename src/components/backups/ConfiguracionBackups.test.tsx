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
  cancelarBackupAction: vi.fn(),
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
  local: { ruta: "/var/vicalba/backups", espacioLibreBytes: null },
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
  proyectoId: null,
  proyectoNombre: null,
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

  it("con destino local guardado muestra el aviso permanente una sola vez", () => {
    renderizar({ ...lista, tipoDestino: "local" });
    expect(screen.getAllByRole("note")).toHaveLength(1);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Las copias están en la misma VPS: si se pierde la VPS o su disco, se pierden también.",
    );
  });

  it("con S3 no hay aviso de destino local", () => {
    renderizar();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
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

  it("«Cancelar» solo aparece con una operación en curso y pide confirmación", async () => {
    a.cancelarBackupAction.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { unmount } = renderizar();
    expect(
      screen.queryByRole("button", { name: /^Cancelar/ }),
    ).not.toBeInTheDocument();
    unmount();

    renderizar({ ...lista, enCurso: true });
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(a.cancelarBackupAction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "¿Cancelar la operación?" }),
    );
    expect(a.cancelarBackupAction).toHaveBeenCalled();
    expect(await screen.findByText("Operación cancelada")).toBeInTheDocument();
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

  it("el interruptor y la hora siguen a los datos del servidor al refrescar", () => {
    const { rerender } = renderizar({ ...lista, habilitado: true, hora: 3 });
    rerender(
      <ToastProvider>
        <ConfiguracionBackups
          config={{ ...lista, habilitado: false, hora: 7 }}
          credenciales={[]}
          historial={[ejecucion({})]}
          copias={[]}
        />
      </ToastProvider>,
    );
    expect(
      screen.getByRole("switch", { name: "Copia diaria" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("button", { name: /hora de la copia/i }),
    ).toHaveTextContent("07:00");
  });

  it("el selector de hora se deshabilita mientras guarda", async () => {
    const user = userEvent.setup();
    let terminar: (v: undefined) => void = () => {};
    a.guardarProgramacionBackupAction.mockReturnValue(
      new Promise((r) => (terminar = r)),
    );
    renderizar();
    await user.click(screen.getByRole("switch", { name: "Copia diaria" }));
    expect(
      screen.getByRole("button", { name: /hora de la copia/i }),
    ).toBeDisabled();
    terminar(undefined);
    await screen.findByText("Programación guardada");
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
