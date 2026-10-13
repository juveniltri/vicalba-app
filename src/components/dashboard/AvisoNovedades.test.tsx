// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AvisoNovedades } from "./AvisoNovedades";

const CLAVE = "vicalba:novedades-vistas";

describe("AvisoNovedades", () => {
  beforeEach(() => localStorage.clear());

  it("avisa de la versión nueva con su resumen y enlaza a Novedades", () => {
    render(<AvisoNovedades version="2.1.0" resumen="Cancelar deploys." />);

    expect(screen.getByText(/Novedades de la v2\.1\.0/)).toBeInTheDocument();
    expect(screen.getByText("Cancelar deploys.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ver novedades/i }),
    ).toHaveAttribute("href", "/novedades");
  });

  it("no aparece si esa versión ya se vio en este navegador", () => {
    localStorage.setItem(CLAVE, "2.1.0");
    const { container } = render(
      <AvisoNovedades version="2.1.0" resumen="Cancelar deploys." />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("vuelve a aparecer cuando sale una versión nueva", () => {
    localStorage.setItem(CLAVE, "2.0.1");
    render(<AvisoNovedades version="2.1.0" resumen={null} />);
    expect(screen.getByText(/Novedades de la v2\.1\.0/)).toBeInTheDocument();
  });

  it("al cerrarlo o al ir a Novedades se recuerda como visto", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(
      <AvisoNovedades version="2.1.0" resumen={null} />,
    );

    await user.click(screen.getByRole("button", { name: /cerrar aviso/i }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(CLAVE)).toBe("2.1.0");
    unmount();

    localStorage.clear();
    render(<AvisoNovedades version="2.1.0" resumen={null} />);
    // jsdom cannot navigate; only the "seen" mark matters here.
    document.addEventListener("click", (e) => e.preventDefault(), {
      once: true,
    });
    await user.click(screen.getByRole("link", { name: /ver novedades/i }));
    expect(localStorage.getItem(CLAVE)).toBe("2.1.0");
  });
});
