// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/app/(panel)/actions", () => ({
  deployProyectoAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./LogsModal", () => ({
  LogsModal: ({
    open,
    proyectoNombre,
  }: {
    open: boolean;
    proyectoNombre: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={`Logs de ${proyectoNombre}`} />
    ) : null,
}));

import { deployProyectoAction } from "@/app/(panel)/actions";
import { FilaProyecto } from "./FilaProyecto";
import type { ProyectoResumen } from "@/lib/schemas/dashboard";

const base: ProyectoResumen = {
  id: "p2",
  nombre: "dp",
  clienteSlug: "microcapilar",
  estado: "running",
  dominio: "dp.microcapilar.es",
  repositorioUrl: "https://github.com/microcapilar/dp",
  rama: "main",
  autoDeployHabilitado: true,
  tipo: "dockerfile",
  puerto: 3000,
  imagenUrl: null,
  dockerfilePath: null,
  buildCommand: null,
  startCommand: null,
  sslActivo: true,
  ssl: { activo: true, caducaEn: "2099-01-01T00:00:00.000Z" },
  ultimoDeploy: {
    hace: "hace 2h",
    rama: "main",
    sha: "c41e9a0ffff",
    resultado: "exito",
    origen: "webhook",
  },
};

function renderFila(p: ProyectoResumen = base) {
  return render(
    <table>
      <tbody>
        <FilaProyecto p={p} />
      </tbody>
    </table>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("FilaProyecto", () => {
  it("enlaza al detalle y muestra estado, tipo, dominio y commit corto", () => {
    renderFila();
    const fila = screen.getByRole("row");

    expect(
      within(fila).getByRole("link", { name: "running dp" }),
    ).toHaveAttribute("href", "/proyectos/p2");
    expect(fila).toHaveTextContent("running");
    expect(fila).toHaveTextContent("dockerfile");
    expect(fila).toHaveTextContent("dp.microcapilar.es");
    expect(fila).toHaveTextContent("c41e9a0");
    expect(fila).toHaveTextContent("hace 2h");
  });

  it("marca el TLS como válido, por caducar o ausente", () => {
    const { unmount } = renderFila();
    expect(screen.getByText("TLS")).toBeInTheDocument();
    unmount();

    renderFila({
      ...base,
      ssl: {
        activo: true,
        caducaEn: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      },
    });
    expect(screen.getByText(/TLS 4 d|TLS 5 d/)).toBeInTheDocument();
  });

  it("indica sin TLS cuando el dominio no tiene certificado", () => {
    renderFila({ ...base, ssl: { activo: false, caducaEn: null } });
    expect(screen.getByText("sin TLS")).toBeInTheDocument();
  });

  it("indica red interna cuando no hay dominio", () => {
    renderFila({ ...base, dominio: null, ssl: null });
    expect(screen.getByText("sin dominio")).toBeInTheDocument();
  });

  it("indica cuando nunca se ha desplegado", () => {
    renderFila({ ...base, ultimoDeploy: null });
    expect(screen.getByRole("row")).toHaveTextContent("sin deploys");
  });

  it("el botón Deploy lanza el deploy y refresca", async () => {
    renderFila();

    await userEvent.click(screen.getByRole("button", { name: "Deploy de dp" }));

    expect(deployProyectoAction).toHaveBeenCalledWith("p2");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("el botón Logs abre los logs del contenedor", async () => {
    renderFila();

    await userEvent.click(screen.getByRole("button", { name: "Logs de dp" }));

    expect(
      screen.getByRole("dialog", { name: "Logs de dp" }),
    ).toBeInTheDocument();
  });

  it("mientras despliega ofrece seguir el log en lugar de redesplegar", () => {
    renderFila({ ...base, estado: "deploying" });

    expect(
      screen.queryByRole("button", { name: "Deploy de dp" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver log" })).toHaveAttribute(
      "href",
      "/proyectos/p2",
    );
  });

  it("muestra el error del deploy si falla al lanzarlo", async () => {
    vi.mocked(deployProyectoAction).mockResolvedValueOnce({
      error: "Sin repositorio",
    });
    renderFila();

    await userEvent.click(screen.getByRole("button", { name: "Deploy de dp" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sin repositorio",
    );
  });
});
