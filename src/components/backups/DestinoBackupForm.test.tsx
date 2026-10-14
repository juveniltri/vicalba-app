// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardarDestinoBackupAction, refresh } = vi.hoisted(() => ({
  guardarDestinoBackupAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => ({ guardarDestinoBackupAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DestinoBackupForm } from "./DestinoBackupForm";
import { ToastProvider } from "@/components/ui/Toast";
import type { ConfiguracionBackupVista } from "@/lib/schemas/dashboard";

const vacia: ConfiguracionBackupVista = {
  habilitado: false,
  hora: 3,
  tipoDestino: null,
  s3: {
    endpoint: null,
    bucket: null,
    region: null,
    prefijo: null,
    accessKeyId: null,
    tieneSecretKey: false,
  },
  sftp: {
    host: null,
    puerto: 22,
    usuario: null,
    ruta: null,
    credencialId: null,
  },
  tieneClave: false,
  claveConfirmada: false,
  repositorioInicializado: false,
  proximaCopia: null,
  enCurso: false,
};

const credenciales = [{ id: "c1", nombre: "Servidor de copias" }];

function renderizar(config = vacia) {
  return render(
    <ToastProvider>
      <DestinoBackupForm config={config} credenciales={credenciales} />
    </ToastProvider>,
  );
}

describe("DestinoBackupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardarDestinoBackupAction.mockResolvedValue({
      repositorio: "inicializado",
    });
  });

  it("S3: envía el destino con la secret key vacía si no se cambia", async () => {
    const user = userEvent.setup();
    renderizar({
      ...vacia,
      tipoDestino: "s3",
      s3: {
        endpoint: "https://s3.ejemplo.com",
        bucket: "mi-bucket",
        region: "eu",
        prefijo: "vicalba",
        accessKeyId: "AK",
        tieneSecretKey: true,
      },
      tieneClave: true,
    });
    expect(screen.getByLabelText("Secret key")).toHaveAttribute(
      "placeholder",
      "Guardada — vacío para mantenerla",
    );
    expect(
      screen.queryByLabelText(/Clave de un repositorio existente/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(guardarDestinoBackupAction).toHaveBeenCalledWith({
      tipo: "s3",
      endpoint: "https://s3.ejemplo.com",
      bucket: "mi-bucket",
      region: "eu",
      prefijo: "vicalba",
      accessKeyId: "AK",
      secretKey: "",
    });
    expect(
      await screen.findByText("Destino guardado: repositorio inicializado"),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("sin clave guardada ofrece usar la de un repositorio existente", async () => {
    const user = userEvent.setup();
    guardarDestinoBackupAction.mockResolvedValue({ repositorio: "existente" });
    renderizar();
    await user.type(screen.getByLabelText("Endpoint"), "https://s3.x");
    await user.type(screen.getByLabelText("Bucket"), "b1");
    await user.type(screen.getByLabelText("Access key ID"), "AK");
    await user.type(screen.getByLabelText("Secret key"), "SK");
    await user.type(
      screen.getByLabelText(/Clave de un repositorio existente/),
      "CLAVE-DEL-KIT-0123456789",
    );
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(guardarDestinoBackupAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "s3",
        secretKey: "SK",
        clave: "CLAVE-DEL-KIT-0123456789",
      }),
    );
    expect(
      await screen.findByText("Destino guardado: repositorio existente"),
    ).toBeInTheDocument();
  });

  it("SFTP: muestra sus campos y envía el destino con la credencial elegida", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("button", { name: "SFTP" }));
    expect(screen.queryByLabelText("Bucket")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Host"), "backup.ejemplo.com");
    const puerto = screen.getByLabelText("Puerto");
    await user.clear(puerto);
    await user.type(puerto, "2222");
    await user.type(screen.getByLabelText("Usuario"), "copias");
    await user.type(screen.getByLabelText("Ruta"), "/srv/vicalba");
    await user.click(screen.getByRole("button", { name: /credencial ssh/i }));
    await user.click(
      screen.getByRole("option", { name: "Servidor de copias" }),
    );
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(guardarDestinoBackupAction).toHaveBeenCalledWith({
      tipo: "sftp",
      host: "backup.ejemplo.com",
      puerto: 2222,
      usuario: "copias",
      ruta: "/srv/vicalba",
      credencialId: "c1",
    });
  });

  it("SFTP sin credenciales SSH avisa de que hay que crear una", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <DestinoBackupForm
          config={{ ...vacia, tipoDestino: "sftp" }}
          credenciales={[]}
        />
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Host")).toBeInTheDocument();
    expect(
      screen.getByText(/Crea una credencial SSH en «Credenciales SSH»/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "S3" }));
    expect(screen.getByLabelText("Bucket")).toBeInTheDocument();
  });

  it("muestra el error del servidor", async () => {
    const user = userEvent.setup();
    guardarDestinoBackupAction.mockResolvedValue({
      error: "La clave no abre el repositorio existente",
    });
    renderizar();
    await user.click(screen.getByRole("button", { name: "Probar y guardar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La clave no abre el repositorio existente",
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
