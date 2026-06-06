// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SSLBadge } from "./SSLBadge";

describe("SSLBadge", () => {
  it("muestra SSL activo con clase text-state-running cuando activo es true", () => {
    render(<SSLBadge estado={{ activo: true, expira: null }} />);
    const badge = screen.getByText(/SSL activo/);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-state-running");
  });

  it("muestra SSL pendiente con clase text-state-deploying cuando activo es false", () => {
    render(<SSLBadge estado={{ activo: false, expira: null }} />);
    const badge = screen.getByText(/SSL pendiente/);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("text-state-deploying");
  });
});
