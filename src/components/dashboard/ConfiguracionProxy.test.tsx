// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG_PROXY_POR_DEFECTO } from "@/lib/schemas/proxy";
import {
  ConfiguracionProxy,
  type EstadoProxy,
  INTERVALO_CONSULTA_MS,
} from "./ConfiguracionProxy";

const { aplicarProxyAction, obtenerProxyAction, logProxyAction } = vi.hoisted(
  () => ({
    aplicarProxyAction: vi.fn(),
    obtenerProxyAction: vi.fn(),
    logProxyAction: vi.fn(),
  }),
);
vi.mock("@/app/(panel)/actions", () => ({
  aplicarProxyAction,
  obtenerProxyAction,
  logProxyAction,
}));

const APLICADA: EstadoProxy = {
  aplicada: CONFIG_PROXY_POR_DEFECTO,
  pendiente: null,
  estado: "aplicada",
  mensaje: null,
  log: null,
};

const cambiar = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });

beforeEach(() => {
  vi.clearAllMocks();
  aplicarProxyAction.mockResolvedValue({ estado: "en_curso" });
});
afterEach(() => vi.useRealTimers());

describe("ConfiguracionProxy", () => {
  it("muestra la configuración aplicada en el formulario", () => {
    render(
      <ConfiguracionProxy
        inicial={{
          ...APLICADA,
          aplicada: {
            ...CONFIG_PROXY_POR_DEFECTO,
            ipsConfianza: ["173.245.48.0/20"],
            accessLog: true,
          },
        }}
      />,
    );
    expect(screen.getByLabelText(/IPs de confianza/)).toHaveValue(
      "173.245.48.0/20",
    );
    expect(screen.getByLabelText(/^Lectura/)).toHaveValue(60);
    expect(screen.getByLabelText(/Access log/)).toBeChecked();
  });

  it("pide confirmación, aplica lo del formulario y avisa de que Traefik se reinicia", async () => {
    render(<ConfiguracionProxy inicial={APLICADA} />);
    cambiar(/IPs de confianza/, "173.245.48.0/20\n2400:cb00::/32");
    cambiar(/^Lectura/, "30");
    cambiar(/^Escritura/, "120");
    cambiar(/^Inactividad/, "0");
    cambiar(/Nivel de log/, "DEBUG");
    cambiar(/TLS mínimo/, "VersionTLS13");
    fireEvent.click(screen.getByLabelText(/Access log/));

    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(aplicarProxyAction).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar y reiniciar" }),
    );

    await waitFor(() =>
      expect(aplicarProxyAction).toHaveBeenCalledWith({
        ipsConfianza: ["173.245.48.0/20", "2400:cb00::/32"],
        timeouts: { lecturaSeg: 30, escrituraSeg: 120, inactividadSeg: 0 },
        logNivel: "DEBUG",
        accessLog: true,
        tlsMinima: "VersionTLS13",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/reiniciando/);
    expect(screen.getByRole("button", { name: "Aplicando…" })).toBeDisabled();
  });

  it("cancelar la confirmación no aplica nada", () => {
    render(<ConfiguracionProxy inicial={APLICADA} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aplicarProxyAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
  });

  it("muestra el error si el servidor rechaza la petición (otra en curso)", async () => {
    aplicarProxyAction.mockResolvedValue({ error: "Ya se está aplicando" });
    render(<ConfiguracionProxy inicial={APLICADA} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar y reiniciar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya se está aplicando",
    );
  });

  it("mientras está en curso consulta el estado, aguanta los fallos de red y muestra el resultado", async () => {
    vi.useFakeTimers();
    const nueva = { ...CONFIG_PROXY_POR_DEFECTO, logNivel: "WARN" as const };
    obtenerProxyAction
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ error: "502" })
      .mockResolvedValueOnce({ ...APLICADA, estado: "en_curso" })
      .mockResolvedValueOnce({ ...APLICADA, aplicada: nueva });
    render(
      <ConfiguracionProxy inicial={{ ...APLICADA, estado: "en_curso" }} />,
    );

    for (let i = 0; i < 4; i++)
      await act(() => vi.advanceTimersByTimeAsync(INTERVALO_CONSULTA_MS));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Nivel de log/)).toHaveValue("WARN");
    expect(obtenerProxyAction).toHaveBeenCalledTimes(4);
  });

  it("si se revirtió explica el motivo, enseña el log y permite recuperar lo que no se aplicó", () => {
    render(
      <ConfiguracionProxy
        inicial={{
          ...APLICADA,
          estado: "revertida",
          mensaje: "Traefik no arrancó; se ha vuelto a la anterior.",
          log: "ERR field not found",
          pendiente: { ...CONFIG_PROXY_POR_DEFECTO, logNivel: "ERROR" },
        }}
      />,
    );
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/vuelto a la anterior/);
    expect(alerta).toHaveTextContent("ERR field not found");

    fireEvent.click(screen.getByRole("button", { name: /no se aplicó/ }));
    expect(screen.getByLabelText(/Nivel de log/)).toHaveValue("ERROR");
  });

  it("un error sin log ni pendiente solo muestra el mensaje", () => {
    render(
      <ConfiguracionProxy
        inicial={{ ...APLICADA, estado: "error", mensaje: "Interrumpido" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Interrumpido");
    expect(screen.queryByText("Log de Traefik")).not.toBeInTheDocument();
  });

  it("enseña las últimas líneas del log de Traefik bajo demanda", async () => {
    logProxyAction
      .mockResolvedValueOnce("INF Starting provider")
      .mockResolvedValueOnce("");
    render(<ConfiguracionProxy inicial={APLICADA} />);
    const boton = screen.getByRole("button", { name: /últimas líneas/ });

    fireEvent.click(boton);
    expect(await screen.findByLabelText("Log de Traefik")).toHaveTextContent(
      "INF Starting provider",
    );
    fireEvent.click(boton);
    await waitFor(() =>
      expect(screen.getByLabelText("Log de Traefik")).toHaveTextContent(
        "(vacío)",
      ),
    );
  });
});
