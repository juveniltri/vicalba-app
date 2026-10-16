// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DominiosPanel, type RutaPanel } from "./DominiosPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { crearRutaAction, editarRutaAction, eliminarRutaAction } = vi.hoisted(
  () => ({
    crearRutaAction: vi.fn(),
    editarRutaAction: vi.fn(),
    eliminarRutaAction: vi.fn(),
  }),
);
vi.mock("@/app/(panel)/actions", () => ({
  crearRutaAction,
  editarRutaAction,
  eliminarRutaAction,
}));

const ruta = (extra: Partial<RutaPanel> = {}): RutaPanel => ({
  id: "r1",
  dominio: "app.acme.com",
  path: "",
  servicio: null,
  puerto: 3000,
  redireccionWww: "ninguna",
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
    rellenar(/Servicio/, "web");
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
      }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("avisa de que una ruta a un Servicio sin alias funcionará tras el próximo deploy", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    rellenar(/^Dominio$/, "api.acme.com");
    rellenar(/Servicio/, "api");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /«api» funcionará tras el próximo deploy/,
    );
  });

  it("en un Proyecto que no es compose no pide Servicio y deja el puerto por defecto", async () => {
    renderPanel({ esCompose: false, rutas: [], puertoProyecto: null });
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo dominio" }));
    expect(screen.queryByLabelText(/Servicio/)).not.toBeInTheDocument();
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
