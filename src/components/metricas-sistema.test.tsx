// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetricasSistema } from "./metricas-sistema";

const METRICAS_OK = {
  cpu: 34.2,
  ram: { usado: 3.1, total: 8.0, unidad: "GB" },
  disco: { usado: 48.3, total: 100.0, unidad: "GB" },
};

function mockFetch(data: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(data),
    } as Response),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("MetricasSistema — estado inicial", () => {
  it("muestra — en las tres métricas antes de recibir datos", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<MetricasSistema />);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});

describe("MetricasSistema — con datos", () => {
  beforeEach(() => mockFetch(METRICAS_OK));

  it("muestra el porcentaje de CPU", async () => {
    render(<MetricasSistema />);
    await screen.findByText("34.2%");
  });

  it("muestra RAM en formato usado / total unidad", async () => {
    render(<MetricasSistema />);
    await screen.findByText("3.1 / 8 GB");
  });

  it("muestra Disco en formato usado / total unidad", async () => {
    render(<MetricasSistema />);
    await screen.findByText("48.3 / 100 GB");
  });
});

describe("MetricasSistema — colores semafóricos", () => {
  it("aplica text-state-running cuando cpu < 70", async () => {
    mockFetch({ ...METRICAS_OK, cpu: 34.2 });
    render(<MetricasSistema />);
    const el = await screen.findByText("34.2%");
    expect(el.className).toContain("text-state-running");
  });

  it("aplica text-state-deploying cuando cpu está entre 70 y 89", async () => {
    mockFetch({ ...METRICAS_OK, cpu: 75 });
    render(<MetricasSistema />);
    const el = await screen.findByText("75%");
    expect(el.className).toContain("text-state-deploying");
  });

  it("aplica text-state-error cuando cpu >= 90", async () => {
    mockFetch({ ...METRICAS_OK, cpu: 95 });
    render(<MetricasSistema />);
    const el = await screen.findByText("95%");
    expect(el.className).toContain("text-state-error");
  });
});

describe("MetricasSistema — resiliencia", () => {
  it("no rompe si el fetch lanza error", () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<MetricasSistema />);
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("mantiene — si la respuesta no es ok", async () => {
    mockFetch(null, false);
    render(<MetricasSistema />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getAllByText("—")).toHaveLength(3);
  });
});
