import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  statfsSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock("os", () => ({
  loadavg: vi.fn(),
  cpus: vi.fn(),
}));

import { readFileSync, statfsSync, existsSync } from "fs";
import { loadavg, cpus } from "os";
import { obtenerMetricas, _resetCpuCache } from "./metrics";

const rfs = vi.mocked(readFileSync);
const sfs = vi.mocked(statfsSync);
const exs = vi.mocked(existsSync);
const avg = vi.mocked(loadavg);
const cpu = vi.mocked(cpus);

// cpu  user nice system idle  iowait irq softirq steal
// Lectura 1: total=900, ocioso=750
const STAT_1 = "cpu  100 0 50 750 0 0 0 0\ncpu0 100 0 50 750 0 0 0 0\n";
// Lectura 2: total=1700, ocioso=1400  →  Δtotal=800, Δocioso=650  →  cpu%=18.75
const STAT_2 = "cpu  200 0 100 1400 0 0 0 0\ncpu0 200 0 100 1400 0 0 0 0\n";

// MemTotal=8388608kB (8GB), MemAvailable=4194304kB (4GB) → usado=4GB, total=8GB
const MEMINFO =
  "MemTotal:       8388608 kB\nMemFree:        1000000 kB\nMemAvailable:   4194304 kB\n";

// bsize=4096, blocks=25_000_000, bavail=12_500_000
// total=102.4GB, libre=51.2GB, usado=51.2GB
const DISK = {
  bsize: 4096,
  blocks: 25_000_000,
  bfree: 12_500_000,
  bavail: 12_500_000,
};

function setupProduccion() {
  vi.stubEnv("NODE_ENV", "production");
  exs.mockReturnValue(true);
  avg.mockReturnValue([1.6, 1.0, 0.8]);
  cpu.mockReturnValue([{}, {}, {}, {}] as ReturnType<typeof cpus>);
  sfs.mockReturnValue(DISK as ReturnType<typeof statfsSync>);
  rfs.mockImplementation((path: unknown) => {
    if (path === "/host/proc/stat") return STAT_1;
    if (path === "/host/proc/meminfo") return MEMINFO;
    throw new Error(`path inesperado: ${path}`);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  _resetCpuCache();
});

describe("obtenerMetricas — modo dev", () => {
  it("devuelve datos simulados cuando NODE_ENV !== production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const r = obtenerMetricas();
    expect(r.cpu).toBe(42);
    expect(r.ram.unidad).toBe("GB");
    expect(r.disco.unidad).toBe("GB");
  });

  it("devuelve datos simulados cuando /host/proc/stat no existe", () => {
    vi.stubEnv("NODE_ENV", "production");
    exs.mockReturnValue(false);
    expect(obtenerMetricas().cpu).toBe(42);
  });
});

describe("CPU — primera llamada (fallback loadavg)", () => {
  beforeEach(setupProduccion);

  it("devuelve loadavg[0] / cpuCount * 100", () => {
    // avg=1.6, cpus=4  →  1.6/4*100 = 40
    const r = obtenerMetricas();
    expect(r.cpu).toBe(40);
  });
});

describe("CPU — segunda llamada (delta real)", () => {
  beforeEach(() => {
    setupProduccion();
    obtenerMetricas(); // calienta caché con STAT_1
    rfs.mockImplementation((path: unknown) => {
      if (path === "/host/proc/stat") return STAT_2;
      if (path === "/host/proc/meminfo") return MEMINFO;
      throw new Error(`path inesperado: ${path}`);
    });
  });

  it("calcula cpu% con delta entre dos lecturas", () => {
    const r = obtenerMetricas();
    // Δtotal=800, Δocioso=650  →  (800-650)/800*100 = 18.75
    expect(r.cpu).toBeCloseTo(18.8, 1);
  });
});

describe("RAM", () => {
  beforeEach(setupProduccion);

  it("calcula usado y total en GB", () => {
    const { ram } = obtenerMetricas();
    expect(ram.total).toBe(8);
    expect(ram.usado).toBe(4);
    expect(ram.unidad).toBe("GB");
  });
});

describe("Disco", () => {
  beforeEach(setupProduccion);

  it("calcula usado y total en GB", () => {
    const { disco } = obtenerMetricas();
    expect(disco.total).toBeCloseTo(102.4, 1);
    expect(disco.usado).toBeCloseTo(51.2, 1);
    expect(disco.unidad).toBe("GB");
  });
});
