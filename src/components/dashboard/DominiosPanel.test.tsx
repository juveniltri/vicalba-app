// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DominiosPanel, type RutaPanel } from "./DominiosPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const {
  crearRutaAction,
  editarRutaAction,
  eliminarRutaAction,
  copiarMiddlewaresAction,
} = vi.hoisted(() => ({
  crearRutaAction: vi.fn(),
  editarRutaAction: vi.fn(),
  eliminarRutaAction: vi.fn(),
  copiarMiddlewaresAction: vi.fn(),
}));
vi.mock("@/app/(panel)/actions", () => ({
  crearRutaAction,
  editarRutaAction,
  eliminarRutaAction,
  copiarMiddlewaresAction,
}));

const ruta = (extra: Partial<RutaPanel> = {}): RutaPanel => ({
  id: "r1",
  dominio: "app.acme.com",
  path: "",
  servicio: null,
  puerto: 3000,
  redireccionWww: "ninguna",
  cloudflare: false,
  soloCloudflare: false,
  middlewares: {},
  ssl: { activo: true, caducaEn: null },
  ...extra,
});

function renderPanel(props: Partial<Parameters<typeof DominiosPanel>[0]> = {}) {
  return render(
    <DominiosPanel
      proyectoId="p1"
      esCompose
      puertoProyecto={3000}
      rutas={[ruta()]}
      yaml={"# generado por vicalba-panel proyecto=p1\nhttp: {}"}
      serviciosConocidos={["web", "api"]}
      serviciosEnMarcha={["web"]}
      {...props}
    />,
  );
}

function rellenar(etiqueta: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(etiqueta), {
    target: { value: valor },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  crearRutaAction.mockResolvedValue(undefined);
  editarRutaAction.mockResolvedValue(undefined);
  eliminarRutaAction.mockResolvedValue(undefined);
  copiarMiddlewaresAction.mockResolvedValue(undefined);
});

describe("DominiosPanel — lista", () => {
  it("muestra dominio, path, destino, certificado y la redirección www", () => {
    renderPanel({
      rutas: [
        ruta({ path: "/api", servicio: "web", redireccionWww: "a_raiz" }),
      ],
    });

    expect(
      screen.getByRole("link", { name: /app\.acme\.com\s?\/api/ }),
    ).toHaveAttribute("href", "https://app.acme.com/api");
    expect(screen.getByText("web:3000")).toBeInTheDocument();
    expect(
      screen.getByText("www.app.acme.com → app.acme.com"),
    ).toBeInTheDocument();
    expect(screen.getByText(/SSL activo/)).toBeInTheDocument();
  });

  it("muestra la redirección de la raíz a www", () => {
    renderPanel({
      rutas: [ruta({ dominio: "www.acme.com", redireccionWww: "a_www" })],
    });
    expect(screen.getByText("acme.com → www.acme.com")).toBeInTheDocument();
  });

  it("marca las rutas a un Servicio sin contenedor, pero no si Docker no respondió", () => {
    const { unmount } = renderPanel({
      rutas: [ruta({ servicio: "api" }), ruta({ id: "r2", dominio: "b.com" })],
    });
    expect(screen.getAllByText(/Servicio no encontrado/)).toHaveLength(1);
    unmount();

    renderPanel({
      rutas: [ruta({ servicio: "api" })],
      serviciosEnMarcha: null,
    });
    expect(
      screen.queryByText(/Servicio no encontrado/),
    ).not.toBeInTheDocument();
  });

  it("sin rutas avisa de que el Proyecto no es accesible desde fuera", () => {
    renderPanel({ rutas: [], yaml: null });
    expect(screen.getByText(/no es accesible desde fuera/)).toBeInTheDocument();
    expect(screen.queryByText(/Ver YAML/)).not.toBeInTheDocument();
  });

  it("enseña el YAML que recibe Traefik", () => {
    renderPanel();
    expect(
      screen.getByText("Ver YAML generado para Traefik"),
    ).toBeInTheDocument();
    expect(screen.getByText(/generado por vicalba-panel/)).toBeInTheDocument();
  });
});

describe("DominiosPanel — alta y edición", () => {
  it("crea una ruta con los datos del formulario y refresca", async () => {
    renderPanel({ rutas: [] });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, " shop.acme.com ");
    rellenar(/Path/, "/tienda");
    rellenar(/^Servicio/, "web");
    rellenar(/Puerto/, "8080");
    rellenar(/Redirección www/, "a_raiz");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(crearRutaAction).toHaveBeenCalledWith("p1", {
        dominio: "shop.acme.com",
        path: "/tienda",
        servicio: "web",
        puerto: 8080,
        redireccionWww: "a_raiz",
        cloudflare: false,
        soloCloudflare: false,
        middlewares: {},
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("avisa de que una ruta a un Servicio sin alias funcionará tras el próximo deploy", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "api.acme.com");
    rellenar(/^Servicio/, "api");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /«api» funcionará tras el próximo deploy/,
    );
  });

  it("en un Proyecto que no es compose no pide Servicio y deja el puerto por defecto", async () => {
    renderPanel({ esCompose: false, rutas: [], puertoProyecto: null });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    expect(screen.queryByLabelText(/^Servicio/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Puerto/)).toHaveAttribute(
      "placeholder",
      "80",
    );
    rellenar(/^Dominio$/, "www.acme.com");
    rellenar(/Redirección www/, "a_www");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(crearRutaAction).toHaveBeenCalledWith("p1", {
        dominio: "www.acme.com",
        path: "",
        servicio: null,
        puerto: undefined,
        redireccionWww: "a_www",
        cloudflare: false,
        soloCloudflare: false,
        middlewares: {},
      }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("edita una ruta partiendo de sus valores", async () => {
    renderPanel({ rutas: [ruta({ servicio: "web", path: "/v1" })] });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar app.acme.com/v1" }),
    );
    expect(screen.getByLabelText(/^Dominio$/)).toHaveValue("app.acme.com");
    rellenar(/Path/, "/v2");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(editarRutaAction).toHaveBeenCalledWith("r1", {
        dominio: "app.acme.com",
        path: "/v2",
        servicio: "web",
        puerto: 3000,
        redireccionWww: "ninguna",
        cloudflare: false,
        soloCloudflare: false,
        middlewares: {},
      }),
    );
  });

  it("muestra el error del servidor y mantiene el formulario abierto", async () => {
    crearRutaAction.mockResolvedValue({
      error: "Ese dominio ya lo usa otra ruta",
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "app.acme.com");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ese dominio ya lo usa otra ruta",
    );
    expect(screen.getByLabelText(/^Dominio$/)).toBeInTheDocument();
  });

  it("cancelar cierra el formulario sin guardar", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByLabelText(/^Dominio$/)).not.toBeInTheDocument();
    expect(crearRutaAction).not.toHaveBeenCalled();
  });
});

describe("DominiosPanel — eliminar", () => {
  it("pide confirmación y elimina", async () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar app.acme.com" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de app.acme.com",
      }),
    );

    await waitFor(() => expect(eliminarRutaAction).toHaveBeenCalledWith("r1"));
    expect(refresh).toHaveBeenCalled();
  });

  it("cancelar la confirmación no elimina", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar app.acme.com" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(eliminarRutaAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Eliminar app.acme.com" }),
    ).toBeInTheDocument();
  });

  it("muestra el error si no se puede eliminar", async () => {
    eliminarRutaAction.mockResolvedValue({ error: "No se pudo" });
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Eliminar app.acme.com" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de app.acme.com",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo");
  });
});

describe("DominiosPanel — Cloudflare", () => {
  it("marca la ruta como detrás de Cloudflare y lo muestra en la tabla", async () => {
    const { unmount } = renderPanel({ rutas: [ruta({ cloudflare: true })] });
    expect(screen.getByText(/Detrás de Cloudflare/)).toBeInTheDocument();
    unmount();

    renderPanel({ rutas: [] });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "a.com");
    fireEvent.click(screen.getByLabelText(/proxy de Cloudflare/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(crearRutaAction.mock.calls[0][1].cloudflare).toBe(true),
    );
  });
});

describe("DominiosPanel — Solo desde Cloudflare", () => {
  const casilla = () => screen.queryByLabelText(/Solo desde Cloudflare/);

  it("la casilla Solo desde Cloudflare solo aparece con Detrás de Cloudflare", () => {
    renderPanel({ rutas: [] });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    expect(casilla()).toBeNull();
    fireEvent.click(screen.getByLabelText(/proxy de Cloudflare/));
    expect(casilla()).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/proxy de Cloudflare/));
    expect(casilla()).toBeNull();
  });

  it("en una ruta nueva viene marcada al marcar Detrás de Cloudflare", async () => {
    renderPanel({ rutas: [] });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "a.com");
    fireEvent.click(screen.getByLabelText(/proxy de Cloudflare/));
    expect(casilla()).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(crearRutaAction.mock.calls[0][1].soloCloudflare).toBe(true),
    );
  });

  it("en una ruta existente conserva su valor", async () => {
    renderPanel({
      rutas: [ruta({ cloudflare: true, soloCloudflare: false })],
    });
    fireEvent.click(screen.getByRole("button", { name: /^Editar app/ }));
    expect(casilla()).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(editarRutaAction.mock.calls[0][1].soloCloudflare).toBe(false),
    );
  });

  it("desmarcar Detrás de Cloudflare envía soloCloudflare false", async () => {
    renderPanel({ rutas: [ruta({ cloudflare: true, soloCloudflare: true })] });
    fireEvent.click(screen.getByRole("button", { name: /^Editar app/ }));
    expect(casilla()).toBeChecked();
    fireEvent.click(screen.getByLabelText(/proxy de Cloudflare/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(editarRutaAction.mock.calls[0][1]).toMatchObject({
        cloudflare: false,
        soloCloudflare: false,
      }),
    );
  });

  it("muestra la etiqueta Solo Cloudflare en la tabla", () => {
    renderPanel({ rutas: [ruta({ cloudflare: true, soloCloudflare: true })] });
    expect(screen.getByText(/Solo Cloudflare/)).toBeInTheDocument();
  });
});

describe("DominiosPanel — protección y cabeceras", () => {
  it("resume en la tabla la protección de cada ruta", () => {
    renderPanel({
      rutas: [
        ruta({
          middlewares: {
            basicAuth: { usuarios: [{ usuario: "ana" }, { usuario: "luis" }] },
            ipPermitidas: ["10.0.0.0/8"],
            limitePeticiones: { media: 10, rafaga: 20 },
            bodyMaximoMB: 5,
            cabeceras: { hsts: true },
            compresion: true,
            quitarPrefijo: true,
          },
        }),
      ],
    });

    const resumen = screen.getByRole("list", {
      name: /Protección de app.acme.com/,
    });
    expect(resumen).toHaveTextContent(
      /Contraseña \(2\).*IPs \(1\).*10 pet\.\/s.*Body ≤ 5 MB.*Cabeceras.*Compresión.*Sin prefijo/,
    );
  });

  it("crea una ruta con autenticación, IPs, límite, body, cabeceras y compresión", async () => {
    renderPanel({ rutas: [] });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "a.com");
    rellenar(/^Path/, "/api");
    fireEvent.click(screen.getByRole("button", { name: "+ Añadir usuario" }));
    rellenar(/^Usuario 1$/, "ana");
    rellenar(/Contraseña de ana/, "secreto-largo");
    rellenar(/IPs o rangos/, "10.0.0.0/8, 203.0.113.7");
    rellenar(/Peticiones\/s/, "10");
    rellenar(/Tamaño máximo/, "5");
    rellenar(/Referrer-Policy/, "no-referrer");
    rellenar(/Cabeceras propias/, "X-Robots-Tag: noindex\nX-Vacia");
    fireEvent.click(screen.getByLabelText(/HSTS/));
    fireEvent.click(screen.getByLabelText(/nosniff/));
    fireEvent.click(screen.getByLabelText(/iframes/));
    fireEvent.click(screen.getByLabelText(/Compresión/));
    fireEvent.click(screen.getByLabelText(/Quitar el path/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(crearRutaAction).toHaveBeenCalled());
    expect(crearRutaAction.mock.calls[0][1].middlewares).toEqual({
      basicAuth: {
        usuarios: [{ usuario: "ana", contrasena: "secreto-largo" }],
      },
      ipPermitidas: ["10.0.0.0/8", "203.0.113.7"],
      limitePeticiones: { media: 10, rafaga: 10 },
      bodyMaximoMB: 5,
      cabeceras: {
        hsts: true,
        nosniff: true,
        frameDeny: true,
        referrerPolicy: "no-referrer",
        propias: { "X-Robots-Tag": "noindex", "X-Vacia": "" },
      },
      compresion: true,
      quitarPrefijo: true,
    });
  });

  it("al editar, los usuarios existentes no cambian de contraseña si se deja vacía y se pueden quitar", async () => {
    renderPanel({
      rutas: [
        ruta({
          middlewares: {
            basicAuth: { usuarios: [{ usuario: "ana" }, { usuario: "luis" }] },
            limitePeticiones: { media: 10, rafaga: 30 },
            bodyMaximoMB: 5,
            cabeceras: { propias: { "X-A": "1" } },
          },
        }),
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar app.acme.com" }),
    );
    expect(screen.getByLabelText(/^Usuario 1$/)).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Quitar luis" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(editarRutaAction).toHaveBeenCalled());
    expect(editarRutaAction.mock.calls[0][1].middlewares).toEqual({
      basicAuth: { usuarios: [{ usuario: "ana" }] },
      limitePeticiones: { media: 10, rafaga: 30 },
      bodyMaximoMB: 5,
      cabeceras: { propias: { "X-A": "1" } },
    });
  });

  it("copia la protección de otra ruta del Proyecto", async () => {
    renderPanel({
      rutas: [
        ruta(),
        ruta({
          id: "r2",
          dominio: "b.com",
          middlewares: { compresion: true },
        }),
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar app.acme.com" }),
    );
    rellenar(/Copiar protección de/, "r2");

    await waitFor(() =>
      expect(copiarMiddlewaresAction).toHaveBeenCalledWith("r2", "r1"),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText(/Compresión/)).toBeChecked();
  });

  it("muestra el error si no se puede copiar", async () => {
    copiarMiddlewaresAction.mockResolvedValue({ error: "No se pudo copiar" });
    renderPanel({ rutas: [ruta(), ruta({ id: "r2", dominio: "b.com" })] });
    fireEvent.click(
      screen.getByRole("button", { name: "Editar app.acme.com" }),
    );
    rellenar(/Copiar protección de/, "r2");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo copiar",
    );
  });
});
