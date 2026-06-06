# Métricas de Sistema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el placeholder "CPU · RAM · Disco — próximamente" del dashboard con métricas reales de la VPS, actualizadas cada 5 segundos.

**Architecture:** Un endpoint `GET /api/system/metrics` lee `/host/proc/stat`, `/host/proc/meminfo` y `fs.statfsSync('/hostroot')` montados vía Docker volumes desde el host. Un componente cliente hace polling cada 5s y muestra barras de progreso con colores semafóricos usando los tokens de estado ya definidos.

**Tech Stack:** Node.js `fs`/`os` modules, Next.js App Router API Route, React `useState`/`useEffect`, Vitest, `@testing-library/react`

---

## Archivos

| Acción | Fichero                                    |
| ------ | ------------------------------------------ |
| Editar | `vitest.config.ts`                         |
| Crear  | `src/lib/system/metrics.ts`                |
| Crear  | `src/lib/system/metrics.test.ts`           |
| Crear  | `src/app/api/system/metrics/route.ts`      |
| Crear  | `src/components/metricas-sistema.tsx`      |
| Crear  | `src/components/metricas-sistema.test.tsx` |
| Editar | `src/app/(panel)/page.tsx`                 |
| Editar | `docker-compose.yml`                       |

---

### Task 1: Añadir threshold de cobertura para `src/lib/system/**`

**Files:**

- Modify: `vitest.config.ts`

- [ ] **Step 1: Añadir el threshold**

En `vitest.config.ts`, tras el bloque `"src/lib/schemas/**"`, añadir:

```typescript
        "src/lib/system/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
```

- [ ] **Step 2: Verificar que el proyecto compila**

```bash
npm run type-check
```

Resultado esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: cobertura 100% para src/lib/system/**"
```

---

### Task 2: Lib de métricas con TDD

**Files:**

- Create: `src/lib/system/metrics.test.ts`
- Create: `src/lib/system/metrics.ts`

- [ ] **Step 1: Escribir los tests**

Crear `src/lib/system/metrics.test.ts`:

```typescript
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
```

- [ ] **Step 2: Verificar que los tests fallan (RED)**

```bash
npx vitest run src/lib/system/metrics.test.ts
```

Resultado esperado: error `Cannot find module './metrics'`.

- [ ] **Step 3: Implementar `src/lib/system/metrics.ts`**

Crear `src/lib/system/metrics.ts`:

```typescript
import { readFileSync, statfsSync, existsSync } from "fs";
import { cpus, loadavg } from "os";

export type MetricasSistema = {
  cpu: number;
  ram: { usado: number; total: number; unidad: "GB" };
  disco: { usado: number; total: number; unidad: "GB" };
};

type CpuSnapshot = { total: number; ocioso: number };
let _prevCpu: CpuSnapshot | null = null;

export function _resetCpuCache(): void {
  _prevCpu = null;
}

function parsearCpu(): number {
  const linea = readFileSync("/host/proc/stat", "utf8").split("\n")[0];
  const campos = linea
    .replace(/^cpu\s+/, "")
    .split(/\s+/)
    .map(Number);
  const [user, nice, system, idle, iowait, irq, softirq, steal] = campos;
  const ocioso = idle + iowait;
  const total = user + nice + system + idle + iowait + irq + softirq + steal;

  if (_prevCpu === null) {
    _prevCpu = { total, ocioso };
    return Math.min(100, (loadavg()[0] / cpus().length) * 100);
  }

  const deltaTotal = total - _prevCpu.total;
  const deltaOcioso = ocioso - _prevCpu.ocioso;
  _prevCpu = { total, ocioso };

  if (deltaTotal === 0) return 0;
  return Math.min(
    100,
    Math.max(0, ((deltaTotal - deltaOcioso) / deltaTotal) * 100),
  );
}

function parsearRam(): MetricasSistema["ram"] {
  const contenido = readFileSync("/host/proc/meminfo", "utf8");
  const extraer = (clave: string): number => {
    const m = contenido.match(new RegExp(`^${clave}:\\s+(\\d+)`, "m"));
    return m ? parseInt(m[1], 10) : 0;
  };
  const totalKb = extraer("MemTotal");
  const disponibleKb = extraer("MemAvailable");
  return {
    usado: parseFloat(((totalKb - disponibleKb) / 1_048_576).toFixed(1)),
    total: parseFloat((totalKb / 1_048_576).toFixed(1)),
    unidad: "GB",
  };
}

function parsearDisco(): MetricasSistema["disco"] {
  const stats = statfsSync("/hostroot");
  const totalBytes = stats.bsize * stats.blocks;
  const libresBytes = stats.bsize * stats.bavail;
  return {
    usado: parseFloat(((totalBytes - libresBytes) / 1e9).toFixed(1)),
    total: parseFloat((totalBytes / 1e9).toFixed(1)),
    unidad: "GB",
  };
}

const DATOS_DEV: MetricasSistema = {
  cpu: 42,
  ram: { usado: 3.2, total: 8.0, unidad: "GB" },
  disco: { usado: 48.5, total: 100.0, unidad: "GB" },
};

export function obtenerMetricas(): MetricasSistema {
  if (process.env.NODE_ENV !== "production" || !existsSync("/host/proc/stat")) {
    return DATOS_DEV;
  }
  return {
    cpu: parseFloat(parsearCpu().toFixed(1)),
    ram: parsearRam(),
    disco: parsearDisco(),
  };
}
```

- [ ] **Step 4: Verificar que los tests pasan (GREEN)**

```bash
npx vitest run src/lib/system/metrics.test.ts
```

Resultado esperado: todos los tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/system/metrics.ts src/lib/system/metrics.test.ts
git commit -m "feat: lib métricas de sistema CPU/RAM/Disco desde /host/proc"
```

---

### Task 3: API route

**Files:**

- Create: `src/app/api/system/metrics/route.ts`

- [ ] **Step 1: Crear la route**

Crear `src/app/api/system/metrics/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { obtenerMetricas } from "@/lib/system/metrics";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(obtenerMetricas());
  } catch {
    return NextResponse.json({ error: "no disponible" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar tipado**

```bash
npm run type-check
```

Resultado esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/system/metrics/route.ts"
git commit -m "feat: GET /api/system/metrics — endpoint métricas de sistema"
```

---

### Task 4: Componente MetricasSistema con TDD

**Files:**

- Create: `src/components/metricas-sistema.test.tsx`
- Create: `src/components/metricas-sistema.tsx`

- [ ] **Step 1: Escribir los tests**

Crear `src/components/metricas-sistema.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Verificar que los tests fallan (RED)**

```bash
npx vitest run src/components/metricas-sistema.test.tsx
```

Resultado esperado: error de importación `Cannot find module './metricas-sistema'`.

- [ ] **Step 3: Implementar `src/components/metricas-sistema.tsx`**

Crear `src/components/metricas-sistema.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import type { MetricasSistema as Metricas } from "@/lib/system/metrics";

const COLOR_MAP = {
  running: { text: "text-state-running", bg: "bg-state-running" },
  deploying: { text: "text-state-deploying", bg: "bg-state-deploying" },
  error: { text: "text-state-error", bg: "bg-state-error" },
} as const;

function clasesColor(pct: number): (typeof COLOR_MAP)[keyof typeof COLOR_MAP] {
  if (pct >= 90) return COLOR_MAP.error;
  if (pct >= 70) return COLOR_MAP.deploying;
  return COLOR_MAP.running;
}

function BarraMetrica({
  label,
  porcentaje,
  etiqueta,
}: {
  label: string;
  porcentaje: number;
  etiqueta: string;
}) {
  const { text, bg } = clasesColor(porcentaje);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-text-muted">{label}</span>
        <span className={`font-body text-xs font-semibold ${text}`}>
          {etiqueta}
        </span>
      </div>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-[var(--duration-slow)] ${bg}`}
          style={{ width: `${Math.min(100, porcentaje)}%` }}
        />
      </div>
    </div>
  );
}

export function MetricasSistema() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch("/api/system/metrics");
        if (res.ok) setMetricas(await res.json());
      } catch {
        // silencioso — el dashboard sigue funcionando
      }
    };
    cargar();
    const id = setInterval(cargar, 5_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section>
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
        Métricas de sistema
      </h2>
      <div className="border border-border rounded-[var(--radius-md)] p-4 flex flex-col gap-4">
        <BarraMetrica
          label="CPU"
          porcentaje={metricas?.cpu ?? 0}
          etiqueta={metricas ? `${metricas.cpu}%` : "—"}
        />
        <BarraMetrica
          label="RAM"
          porcentaje={
            metricas ? (metricas.ram.usado / metricas.ram.total) * 100 : 0
          }
          etiqueta={
            metricas
              ? `${metricas.ram.usado} / ${metricas.ram.total} ${metricas.ram.unidad}`
              : "—"
          }
        />
        <BarraMetrica
          label="Disco"
          porcentaje={
            metricas ? (metricas.disco.usado / metricas.disco.total) * 100 : 0
          }
          etiqueta={
            metricas
              ? `${metricas.disco.usado} / ${metricas.disco.total} ${metricas.disco.unidad}`
              : "—"
          }
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Verificar que los tests pasan (GREEN)**

```bash
npx vitest run src/components/metricas-sistema.test.tsx
```

Resultado esperado: todos los tests en verde.

- [ ] **Step 5: Commit**

```bash
git add src/components/metricas-sistema.tsx src/components/metricas-sistema.test.tsx
git commit -m "feat: componente MetricasSistema con polling cada 5s"
```

---

### Task 5: Integración en dashboard y volúmenes Docker

**Files:**

- Modify: `src/app/(panel)/page.tsx`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Actualizar el dashboard**

En `src/app/(panel)/page.tsx`, añadir el import al inicio del fichero (junto a los demás imports):

```typescript
import { MetricasSistema } from "@/components/metricas-sistema";
```

Reemplazar el bloque del placeholder:

```tsx
{
  /* Placeholder métricas */
}
<section>
  <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
    Métricas de sistema
  </h2>
  <div className="border border-dashed border-border rounded-[var(--radius-md)] p-8 text-center">
    <p className="font-body text-xs text-text-muted">
      CPU · RAM · Disco — próximamente
    </p>
  </div>
</section>;
```

por:

```tsx
<MetricasSistema />
```

- [ ] **Step 2: Añadir volúmenes al servicio `panel` en `docker-compose.yml`**

En `docker-compose.yml`, al bloque `volumes:` del servicio `panel`, añadir las dos líneas nuevas al final del bloque (antes de `depends_on:`):

```yaml
# Métricas del host — solo lectura
- /proc:/host/proc:ro
- /:/hostroot:ro,rslave
```

- [ ] **Step 3: Verificar tipado y suite completa**

```bash
npm run type-check && npx vitest run
```

Resultado esperado: sin errores de tipo, todos los tests en verde.

- [ ] **Step 4: Commit**

```bash
git add src/app/(panel)/page.tsx docker-compose.yml
git commit -m "feat: métricas CPU/RAM/Disco en dashboard con polling 5s"
```
