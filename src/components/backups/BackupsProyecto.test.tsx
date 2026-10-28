// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const a = vi.hoisted(() => ({
  copiarProyectoBackupAction: vi.fn(),
  restaurarProyectoBackupAction: vi.fn(),
  marcarElementoBackupAction: vi.fn(),
  habilitarProyectoBackupAction: vi.fn(),
  cancelarBackupAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => a);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: a.refresh }),
}));

import { BackupsProyecto } from "./BackupsProyecto";
import { ToastProvider } from "@/components/ui/Toast";
import type {
  BackupsProyectoVista,
  CopiaProyecto,
} from "@/lib/schemas/dashboard";

const estadoBase: BackupsProyectoVista = {
  habilitado: true,
  valida: true,
  elementos: [
    {
      tipo: "bd",
      clave: "bd:db",
      servicio: "db",
      motor: "postgres",
      contenedorId: "c1",
      enMarcha: true,
      incluido: true,
    },
    {
      tipo: "datos",
      clave: "datos:./data/media",
      origen: "/r/media",
      montaje: "bind",
      restaurable: true,
      incluido: false,
    },
  ],
  noCopiados: [{ origen: "/etc", motivo: "Fuera de la carpeta del Cliente" }],
  ultima: { iniciadoEn: new Date("2026-10-14T01:00:00Z"), resultado: "exito" },
  restaurando: false,
  enCurso: false,
};

const copia: CopiaProyecto = {
  id: "cabcdefghijklmnopqrstu",
  fecha: new Date("2026-10-14T01:00:00Z"),
  origen: "manual",
  bytes: 2048,
  elementos: [
    { clave: "bd:db", restaurable: true },
    { clave: "datos:.panel/x", restaurable: false },
  ],
} as CopiaProyecto;

function renderizar(
  props: Partial<Parameters<typeof BackupsProyecto>[0]> = {},
) {
  return render(
    <ToastProvider>
      <BackupsProyecto
        proyectoId="p1"
        proyectoNombre="crm"
        destinoConfigurado
        estado={estadoBase}
        copias={[copia]}
        {...props}
      />
    </ToastProvider>,
  );
}

describe("BackupsProyecto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    a.copiarProyectoBackupAction.mockResolvedValue(undefined);
    a.restaurarProyectoBackupAction.mockResolvedValue(undefined);
    a.marcarElementoBackupAction.mockResolvedValue(undefined);
    a.habilitarProyectoBackupAction.mockResolvedValue(undefined);
    a.cancelarBackupAction.mockResolvedValue(undefined);
  });

  it("lista los elementos con su casilla y tipo, y los que no se copian con su motivo", () => {
    renderizar();
    expect(screen.getByLabelText("bd:db")).toBeChecked();
    expect(screen.getByLabelText("datos:./data/media")).not.toBeChecked();
    expect(screen.getByText("Base de datos")).toBeInTheDocument();
    expect(screen.getByText("Datos")).toBeInTheDocument();
    expect(screen.getByText("No se copia")).toBeInTheDocument();
    expect(screen.getByText("/etc")).toBeInTheDocument();
    expect(
      screen.getByText("Fuera de la carpeta del Cliente"),
    ).toBeInTheDocument();
  });

  it("marcar una casilla guarda el cambio", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByLabelText("datos:./data/media"));
    expect(a.marcarElementoBackupAction).toHaveBeenCalledWith(
      "p1",
      "datos:./data/media",
      true,
    );
    expect(screen.getByLabelText("datos:./data/media")).toBeChecked();
  });

  it("si no se puede guardar la casilla vuelve a su valor y avisa", async () => {
    a.marcarElementoBackupAction.mockResolvedValue({ error: "Falló" });
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByLabelText("bd:db"));
    expect(await screen.findByText("Falló")).toBeInTheDocument();
    expect(screen.getByLabelText("bd:db")).toBeChecked();
  });

  it("el interruptor del Proyecto habilita o deshabilita sus copias", async () => {
    const user = userEvent.setup();
    renderizar();
    const sw = screen.getByRole("switch", { name: "Copias de este Proyecto" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    await user.click(sw);
    expect(a.habilitarProyectoBackupAction).toHaveBeenCalledWith("p1", false);
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("si el interruptor no se guarda, avisa y conserva su valor", async () => {
    a.habilitarProyectoBackupAction.mockResolvedValue({ error: "Falló" });
    const user = userEvent.setup();
    renderizar();
    const sw = screen.getByRole("switch", { name: "Copias de este Proyecto" });
    await user.click(sw);
    expect(await screen.findByText("Falló")).toBeInTheDocument();
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("muestra la última copia y su estado", () => {
    renderizar();
    expect(screen.getByText(/Última copia/)).toHaveTextContent("correcta");
  });

  it("sin copias previas lo indica", () => {
    renderizar({ estado: { ...estadoBase, ultima: null } });
    expect(screen.getByText(/Última copia/)).toHaveTextContent("Ninguna");
  });

  it("«Copia ahora» llama a la acción y avisa con un toast", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Copia ahora" }));
    expect(a.copiarProyectoBackupAction).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("Copia iniciada")).toBeInTheDocument();
  });

  it("sin destino avisa con un enlace a Configuración sin estilo de error", () => {
    renderizar({ destinoConfigurado: false, copias: null });
    const enlace = screen.getByRole("link", {
      name: /Configuración → Backups/,
    });
    expect(enlace).toHaveAttribute("href", "/configuracion?seccion=backups");
    expect(enlace.parentElement?.className ?? "").not.toMatch(/error/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia ahora" })).toBeDisabled();
  });

  it("un Proyecto sin contenedores no deja copiar", () => {
    renderizar({ estado: { ...estadoBase, valida: false, elementos: [] } });
    expect(screen.getByText(/no tiene contenedores/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia ahora" })).toBeDisabled();
  });

  it("muestra el error de la detección", () => {
    renderizar({ estado: { error: "Docker no responde" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Docker no responde");
  });

  it("muestra el error al listar las copias", () => {
    renderizar({ copias: { error: "403 Forbidden" } });
    expect(screen.getByRole("alert")).toHaveTextContent("403 Forbidden");
  });

  it("sin copias lo indica", () => {
    renderizar({ copias: [] });
    expect(
      screen.getByText("Aún no hay copias de este Proyecto"),
    ).toBeInTheDocument();
  });

  it("restaurar: casillas (las de .panel/ deshabilitadas con enlace a la guía) y confirmación con el nombre", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByLabelText("bd:db")).toBeChecked();
    const panel = within(dialogo).getByLabelText("datos:.panel/x");
    expect(panel).toBeDisabled();
    expect(
      within(dialogo).getByRole("link", { name: /a mano/ }),
    ).toHaveAttribute("href", "/guia");

    const confirmar = within(dialogo).getByRole("button", {
      name: "Restaurar copia",
    });
    expect(confirmar).toBeDisabled();
    await user.type(within(dialogo).getByLabelText(/Escribe crm/), "crm");
    await user.click(confirmar);

    expect(a.restaurarProyectoBackupAction).toHaveBeenCalledWith(
      "p1",
      "cabcdefghijklmnopqrstu",
      ["bd:db"],
      "crm",
    );
    expect(
      await screen.findByText("Restauración iniciada"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin ningún elemento marcado no deja restaurar", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    const dialogo = screen.getByRole("dialog");
    await user.click(within(dialogo).getByLabelText("bd:db"));
    await user.type(screen.getByLabelText(/Escribe crm/), "crm");
    expect(
      screen.getByRole("button", { name: "Restaurar copia" }),
    ).toBeDisabled();
  });

  it("un error de la restauración se muestra en el modal", async () => {
    a.restaurarProyectoBackupAction.mockResolvedValue({ error: "Rechazada" });
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await user.type(screen.getByLabelText(/Escribe crm/), "crm");
    await user.click(screen.getByRole("button", { name: "Restaurar copia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Rechazada");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("cancelar cierra el modal sin restaurar", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(a.restaurarProyectoBackupAction).not.toHaveBeenCalled();
  });

  it("«Restaurando…» deshabilita las acciones", () => {
    renderizar({ estado: { ...estadoBase, restaurando: true } });
    expect(screen.getByText("Restaurando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copia ahora" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restaurar" })).toBeDisabled();
    expect(screen.getByLabelText("bd:db")).toBeDisabled();
  });

  it("«Cancelar» con confirmación cuando hay una operación en curso", async () => {
    const user = userEvent.setup();
    renderizar({ estado: { ...estadoBase, enCurso: true } });
    expect(screen.getByRole("button", { name: "Copia ahora" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(a.cancelarBackupAction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "¿Cancelar la operación?" }),
    );
    expect(a.cancelarBackupAction).toHaveBeenCalled();
  });

  it("sin operación en curso no hay botón Cancelar", () => {
    renderizar();
    expect(
      screen.queryByRole("button", { name: "Cancelar" }),
    ).not.toBeInTheDocument();
  });
});
