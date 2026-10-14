// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuiaUsuario } from "./GuiaUsuario";

const md = [
  "# Parte I — Tareas",
  "Introducción con **negrita**.",
  "## Entrar y orientarse",
  "![El Dashboard](../public/guia/dashboard.png)",
  "### Si algo falla",
  "Revisa [la recuperación](https://example.com/recuperacion).",
  "## Entrar y orientarse",
].join("\n\n");

describe("GuiaUsuario", () => {
  it("pinta los títulos con las mismas anclas que el índice", () => {
    render(<GuiaUsuario markdown={md} />);
    const indice = screen.getByRole("navigation", {
      name: "Índice de la guía",
    });
    const enlaces = within(indice).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual([
      "#parte-i-tareas",
      "#entrar-y-orientarse",
      "#entrar-y-orientarse-2",
    ]);
    for (const a of enlaces) {
      const id = a.getAttribute("href")!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("sirve las imágenes desde /guia y las abre a tamaño real", () => {
    render(<GuiaUsuario markdown={md} />);
    const img = screen.getByRole("img", { name: "El Dashboard" });
    expect(img).toHaveAttribute("src", "/guia/dashboard.png");
    expect(img.closest("a")).toHaveAttribute("href", "/guia/dashboard.png");
    expect(img.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("ofrece el PDF", () => {
    render(<GuiaUsuario markdown={md} />);
    const pdf = screen.getByRole("link", { name: "Descargar PDF" });
    expect(pdf).toHaveAttribute("href", "/guia/guia-usuario.pdf");
    expect(pdf).toHaveAttribute("download");
  });

  it("los enlaces externos se abren aparte", () => {
    render(<GuiaUsuario markdown={md} />);
    const enlace = screen.getByRole("link", { name: "la recuperación" });
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noreferrer");
  });

  it("pinta listas, código y enlaces internos, y un título con formato conserva su ancla", () => {
    const rico = [
      "## Usar **⌘K** y `npm`",
      "1. Paso uno",
      "2. Paso dos",
      "",
      "- Opción con `código`",
      "",
      "```bash",
      "npm run guia",
      "```",
      "",
      "Ver [el índice](#usar-k-y-npm).",
    ].join("\n");
    const { container } = render(<GuiaUsuario markdown={rico} />);
    expect(document.getElementById("usar-k-y-npm")).toHaveTextContent(
      "Usar ⌘K y npm",
    );
    expect(container.querySelector("article ol li")).toHaveTextContent(
      "Paso uno",
    );
    expect(container.querySelector("article ul li code")).toHaveTextContent(
      "código",
    );
    expect(container.querySelector("pre code")).toHaveTextContent(
      "npm run guia",
    );
    const interno = screen.getByRole("link", { name: "el índice" });
    expect(interno).toHaveAttribute("href", "#usar-k-y-npm");
    expect(interno).not.toHaveAttribute("target");
  });

  it("no inserta HTML del Markdown como elementos", () => {
    const { container } = render(
      <GuiaUsuario
        markdown={
          '<script>window.x=1</script>\n\n<img src="x" onerror="alert(1)">\n\nTexto'
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText("Texto")).toBeInTheDocument();
  });
});
