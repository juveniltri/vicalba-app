// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Todo ok")}>success</button>
      <button onClick={() => toast.error("Algo falló")}>error</button>
    </div>
  );
}

describe("ToastProvider / useToast", () => {
  it("renderiza un toast de éxito al llamar a success()", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("success"));

    expect(await screen.findByText("Todo ok")).toBeInTheDocument();
  });

  it("renderiza un toast de error al llamar a error()", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("error"));

    expect(await screen.findByText("Algo falló")).toBeInTheDocument();
  });

  it("elimina el toast automáticamente tras el timeout", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("success"));
    expect(screen.getByText("Todo ok")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Todo ok")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("lanza un error si useToast se usa fuera de ToastProvider", () => {
    const Broken = () => {
      useToast();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow(
      "useToast debe usarse dentro de ToastProvider",
    );
    spy.mockRestore();
  });
});
