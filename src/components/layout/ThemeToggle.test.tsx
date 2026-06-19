// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetTheme = vi.fn();
const mockUseTheme = vi.fn();

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => mockUseTheme(),
}));

import { ThemeToggle } from "./ThemeToggle";

beforeEach(() => vi.clearAllMocks());

describe("ThemeToggle — tema dark", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "dark", setTheme: mockSetTheme });
  });

  it("muestra el botón con aria-label para activar modo claro", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /activar modo claro/i }),
    ).toBeInTheDocument();
  });

  it("al pulsar llama a setTheme con 'light'", () => {
    render(<ThemeToggle />);
    fireEvent.click(
      screen.getByRole("button", { name: /activar modo claro/i }),
    );
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});

describe("ThemeToggle — tema light", () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ theme: "light", setTheme: mockSetTheme });
  });

  it("muestra el botón con aria-label para activar modo oscuro", () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole("button", { name: /activar modo oscuro/i }),
    ).toBeInTheDocument();
  });

  it("al pulsar llama a setTheme con 'dark'", () => {
    render(<ThemeToggle />);
    fireEvent.click(
      screen.getByRole("button", { name: /activar modo oscuro/i }),
    );
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
