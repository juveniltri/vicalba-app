// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExploradorVolumenModal } from "./ExploradorVolumenModal";

beforeAll(() => {
  global.fetch = vi.fn();
  global.confirm = vi.fn(() => true);
});

const mockVolumen = { id: "v1", nombre: "galeria" };

const mockFicheros = [
  {
    nombre: "banner.png",
    tipo: "file" as const,
    tamaño: 2100000,
    modificadoEn: null,
  },
  { nombre: "fotos", tipo: "dir" as const, tamaño: null, modificadoEn: null },
];

function mockFetch(data: unknown, ok = true) {
  vi.mocked(global.fetch).mockResolvedValue({
    ok,
    json: async () => data,
    blob: async () => new Blob(),
  } as Response);
}

describe("ExploradorVolumenModal — visibilidad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no renderiza nada si open es false", () => {
    const { container } = render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={false}
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza el título con el nombre del volumen cuando open es true", async () => {
    mockFetch([]);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/galeria/i)).toBeInTheDocument();
  });

  it("llama a onClose al pulsar el botón de cerrar", async () => {
    mockFetch([]);
    const onClose = vi.fn();
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ExploradorVolumenModal — listado de ficheros", () => {
  beforeEach(() => vi.clearAllMocks());

  it("carga los ficheros al abrir el modal", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/banner\.png/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /fotos/ })).toBeInTheDocument();
  });

  it("navega a una subcarpeta al hacer click en un directorio", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByRole("button", { name: /fotos/ }));

    mockFetch([
      {
        nombre: "2024.jpg",
        tipo: "file",
        tamaño: 500,
        modificadoEn: null,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /fotos/ }));

    await waitFor(() =>
      expect(screen.getByText(/2024\.jpg/)).toBeInTheDocument(),
    );
    // "fotos" aparece en el breadcrumb
    expect(screen.getByRole("button", { name: "fotos" })).toBeInTheDocument();
  });

  it("navega a la raíz al pulsar '/' en el breadcrumb", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    mockFetch([]);
    fireEvent.click(screen.getByRole("button", { name: /raíz/i }));

    await waitFor(() => {
      const lastCall = vi.mocked(global.fetch).mock.calls.at(-1)?.[0] as string;
      expect(lastCall).not.toContain("path=");
    });
  });
});

describe("ExploradorVolumenModal — selección", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checkbox individual selecciona un fichero", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    const cb = screen.getByRole("checkbox", { name: "banner.png" });
    fireEvent.click(cb);
    expect(cb).toBeChecked();
    expect(screen.getByText(/1 seleccionado/i)).toBeInTheDocument();
  });

  it("checkbox 'seleccionar todos' selecciona todos los ficheros", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    fireEvent.click(
      screen.getByRole("checkbox", { name: /seleccionar todos/i }),
    );
    expect(screen.getByText(/2 seleccionados/i)).toBeInTheDocument();
  });

  it("el enlace de descarga apunta al endpoint con los ficheros seleccionados", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    fireEvent.click(screen.getByRole("checkbox", { name: "banner.png" }));

    const link = await screen.findByRole("link", { name: /descargar zip/i });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("files=banner.png"),
    );
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/api/volumes/v1/files/download"),
    );
  });
});

describe("ExploradorVolumenModal — crear carpeta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra input inline al pulsar '+ Carpeta'", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    fireEvent.click(screen.getByRole("button", { name: /crear carpeta/i }));
    expect(
      screen.getByPlaceholderText(/nombre de la carpeta/i),
    ).toBeInTheDocument();
  });

  it("llama al endpoint mkdir al confirmar con Enter", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    fireEvent.click(screen.getByRole("button", { name: /crear carpeta/i }));
    const input = screen.getByPlaceholderText(/nombre de la carpeta/i);
    fireEvent.change(input, { target: { value: "nueva-carpeta" } });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({}),
    } as Response);
    mockFetch(mockFicheros); // para el reload
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/volumes/v1/files/mkdir`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});

describe("ExploradorVolumenModal — eliminar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("elimina los ficheros seleccionados al pulsar Eliminar", async () => {
    mockFetch(mockFicheros);
    render(
      <ExploradorVolumenModal
        volumen={mockVolumen}
        open={true}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => screen.getByText(/banner\.png/));

    fireEvent.click(screen.getByRole("checkbox", { name: "banner.png" }));

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("banner.png"),
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });
});
