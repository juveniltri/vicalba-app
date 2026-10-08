// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Listbox } from "./Listbox";

const options = [
  { value: "a", label: "Opción A" },
  { value: "b", label: "Opción B" },
  { value: "c", label: "Opción C" },
];

describe("Listbox", () => {
  it("muestra la label del valor seleccionado, cerrado", () => {
    render(<Listbox value="b" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Opción B");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("click en el botón abre el popup de opciones", async () => {
    const user = userEvent.setup();
    render(<Listbox value="a" options={options} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("click en una opción llama a onChange y cierra el popup", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Listbox value="a" options={options} onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("option", { name: "Opción C" }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape cierra el popup sin llamar a onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Listbox value="a" options={options} onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowDown + ArrowDown + Enter navega y selecciona por teclado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Listbox value="a" options={options} onChange={onChange} />);
    await user.click(screen.getByRole("button"));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("click fuera cierra el popup sin cambiar el valor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <div>
        <Listbox value="a" options={options} onChange={onChange} />
        <button>fuera</button>
      </div>,
    );
    await user.click(screen.getByRole("button", { name: /opción a/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "fuera" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("asocia el id pasado al botón para que un <label htmlFor> lo enlace", () => {
    render(
      <Listbox id="tipo" value="a" options={options} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("id", "tipo");
  });
});
