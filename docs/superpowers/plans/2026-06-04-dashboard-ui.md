# Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la UI del dashboard con datos ficticios — sidebar, barra de métricas globales, tarjetas de proyecto agrupadas por cliente y acciones condicionales por estado.

**Architecture:** Server Components + Client islands. `page.tsx` importa `mock-data.ts` y pasa props a los componentes. Solo `ProjectCard` y `SidebarLink` son Client Components. Cuando se conecte tRPC, solo cambia `page.tsx`.

**Tech Stack:** Next.js 15 App Router, TypeScript estricto, Tailwind CSS v4, Vitest, @testing-library/react v16, jsdom.

---

## Ficheros que se crean o modifican

| Fichero                                           | Acción    | Notas                                 |
| ------------------------------------------------- | --------- | ------------------------------------- |
| `src/lib/mock-data.ts`                            | Crear     | Tipos del dominio + datos ficticios   |
| `src/components/dashboard/StatusBadge.tsx`        | Crear     | Server Component, badge de estado     |
| `src/components/dashboard/StatsBar.tsx`           | Crear     | Server Component, 4 pills de métricas |
| `src/components/dashboard/ProjectCard.tsx`        | Crear     | Client Component, tarjeta interactiva |
| `src/components/dashboard/ClientSection.tsx`      | Crear     | Server Component, sección por cliente |
| `src/components/layout/SidebarLink.tsx`           | Crear     | Client Component, enlace activo       |
| `src/components/layout/Sidebar.tsx`               | Crear     | Server Component, nav lateral         |
| `src/app/(panel)/layout.tsx`                      | Crear     | Route group con sidebar               |
| `src/app/(panel)/page.tsx`                        | Crear     | Dashboard page                        |
| `src/app/page.tsx`                                | Eliminar  | Reemplazado por `(panel)/page.tsx`    |
| `src/test/setup.ts`                               | Modificar | Añadir @testing-library/jest-dom      |
| `package.json`                                    | Modificar | Añadir devDependencies de testing     |
| `src/components/dashboard/StatusBadge.test.tsx`   | Crear     | Tests de StatusBadge                  |
| `src/components/dashboard/StatsBar.test.tsx`      | Crear     | Tests de StatsBar                     |
| `src/components/dashboard/ProjectCard.test.tsx`   | Crear     | Tests de ProjectCard                  |
| `src/components/dashboard/ClientSection.test.tsx` | Crear     | Tests de ClientSection                |
| `src/components/layout/SidebarLink.test.tsx`      | Crear     | Tests de SidebarLink                  |

---

## Task 1: Instalar dependencias de testing para componentes

**Files:**

- Modify: `package.json`
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install --save-dev @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^26
```

Salida esperada: `added N packages` sin errores de peer dependency.

- [ ] **Step 2: Actualizar src/test/setup.ts**

```ts
import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
});
```

- [ ] **Step 3: Verificar que los tests existentes siguen pasando**

```bash
npm run test:unit
```

Salida esperada: todos los tests pasan (0 fallos).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/test/setup.ts
git commit -m "chore: add @testing-library/react and jsdom for component tests"
```

---

## Task 2: Crear src/lib/mock-data.ts

**Files:**

- Create: `src/lib/mock-data.ts`

No hay tests (solo tipos TypeScript y datos estáticos; la verificación la hace el compilador).

- [ ] **Step 1: Crear el fichero con tipos y datos**

```ts
export type EstadoServicio = "running" | "stopped" | "error" | "deploying";

export type Servicio = {
  nombre: string;
  estado: EstadoServicio;
};

export type Proyecto = {
  id: string;
  nombre: string;
  clienteSlug: string;
  estado: EstadoServicio;
  servicios: Servicio[];
  dominio: string | null;
  ultimoDeploy: { hace: string; rama: string } | null;
};

export type Cliente = {
  slug: string;
  nombre: string;
  proyectos: Proyecto[];
};

export const clientes: Cliente[] = [
  {
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    proyectos: [
      {
        id: "p1",
        nombre: "web-app",
        clienteSlug: "cliente-uno",
        estado: "running",
        servicios: [
          { nombre: "nginx", estado: "running" },
          { nombre: "node", estado: "running" },
        ],
        dominio: "app.cliente-uno.com",
        ultimoDeploy: { hace: "hace 2h", rama: "main" },
      },
      {
        id: "p2",
        nombre: "api",
        clienteSlug: "cliente-uno",
        estado: "stopped",
        servicios: [{ nombre: "fastapi", estado: "stopped" }],
        dominio: "api.cliente-uno.com",
        ultimoDeploy: { hace: "hace 5h", rama: "main" },
      },
    ],
  },
  {
    slug: "cliente-dos",
    nombre: "Cliente Dos",
    proyectos: [
      {
        id: "p3",
        nombre: "landing",
        clienteSlug: "cliente-dos",
        estado: "error",
        servicios: [{ nombre: "nginx", estado: "error" }],
        dominio: "landing.cliente-dos.com",
        ultimoDeploy: { hace: "hace 1d", rama: "main" },
      },
      {
        id: "p4",
        nombre: "worker",
        clienteSlug: "cliente-dos",
        estado: "deploying",
        servicios: [{ nombre: "celery", estado: "deploying" }],
        dominio: null,
        ultimoDeploy: { hace: "hace 10m", rama: "develop" },
      },
    ],
  },
];
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run type-check
```

Salida esperada: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mock-data.ts
git commit -m "feat: add domain types and mock data for dashboard"
```

---

## Task 3: StatusBadge (TDD)

**Files:**

- Create: `src/components/dashboard/StatusBadge.tsx`
- Create: `src/components/dashboard/StatusBadge.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/StatusBadge.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "@/components/dashboard/StatusBadge";

describe("StatusBadge", () => {
  it('muestra la etiqueta "running"', () => {
    render(<StatusBadge estado="running" />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it('muestra la etiqueta "stopped"', () => {
    render(<StatusBadge estado="stopped" />);
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });

  it('muestra la etiqueta "error"', () => {
    render(<StatusBadge estado="error" />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it('muestra la etiqueta "deploying"', () => {
    render(<StatusBadge estado="deploying" />);
    expect(screen.getByText("deploying")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar para confirmar que falla**

```bash
npm run test:unit -- StatusBadge
```

Salida esperada: `FAIL` — `Cannot find module '@/components/dashboard/StatusBadge'`

- [ ] **Step 3: Implementar StatusBadge**

```tsx
// src/components/dashboard/StatusBadge.tsx
import type { EstadoServicio } from "@/lib/mock-data";

const config: Record<
  EstadoServicio,
  { label: string; dot: string; text: string }
> = {
  running: {
    label: "running",
    dot: "bg-state-running",
    text: "text-state-running",
  },
  stopped: {
    label: "stopped",
    dot: "bg-state-stopped",
    text: "text-state-stopped",
  },
  error: { label: "error", dot: "bg-state-error", text: "text-state-error" },
  deploying: {
    label: "deploying",
    dot: "bg-state-deploying",
    text: "text-state-deploying",
  },
};

export function StatusBadge({ estado }: { estado: EstadoServicio }) {
  const { label, dot, text } = config[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-body text-xs ${text}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Ejecutar para confirmar que pasa**

```bash
npm run test:unit -- StatusBadge
```

Salida esperada: `PASS` — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/StatusBadge.tsx src/components/dashboard/StatusBadge.test.tsx
git commit -m "feat: add StatusBadge component"
```

---

## Task 4: SidebarLink + Sidebar (TDD)

**Files:**

- Create: `src/components/layout/SidebarLink.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/SidebarLink.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/layout/SidebarLink.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUsePathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: string;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { SidebarLink } from "@/components/layout/SidebarLink";

describe("SidebarLink", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
  });

  it("renderiza el texto del enlace", () => {
    mockUsePathname.mockReturnValue("/otro");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it('marca aria-current="page" cuando la ruta coincide con href', () => {
    mockUsePathname.mockReturnValue("/");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no marca aria-current cuando la ruta no coincide", () => {
    mockUsePathname.mockReturnValue("/proyectos");
    render(<SidebarLink href="/">Dashboard</SidebarLink>);
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
```

- [ ] **Step 2: Ejecutar para confirmar que falla**

```bash
npm run test:unit -- SidebarLink
```

Salida esperada: `FAIL` — `Cannot find module '@/components/layout/SidebarLink'`

- [ ] **Step 3: Implementar SidebarLink y Sidebar**

```tsx
// src/components/layout/SidebarLink.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center px-3 py-2 rounded-[var(--radius-sm)] font-body text-sm transition-colors duration-[var(--duration-fast)] ${
        isActive
          ? "bg-primary-500/10 text-primary-300 border-l-2 border-primary-500 pl-[calc(0.75rem-2px)]"
          : "text-text-muted hover:text-text-primary hover:bg-surface"
      }`}
    >
      {children}
    </Link>
  );
}
```

```tsx
// src/components/layout/Sidebar.tsx
import { SidebarLink } from "./SidebarLink";

export function Sidebar() {
  return (
    <aside className="w-48 shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-4 py-5 border-b border-border">
        <span className="font-display text-base font-bold text-text-primary tracking-wide">
          VICALBA
        </span>
      </div>
      <nav
        className="flex-1 p-2 flex flex-col gap-0.5"
        aria-label="navegación principal"
      >
        <SidebarLink href="/">Dashboard</SidebarLink>
        <SidebarLink href="/proyectos">Proyectos</SidebarLink>
        <SidebarLink href="/configuracion">Configuración</SidebarLink>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 4: Ejecutar para confirmar que pasa**

```bash
npm run test:unit -- SidebarLink
```

Salida esperada: `PASS` — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SidebarLink.tsx src/components/layout/Sidebar.tsx src/components/layout/SidebarLink.test.tsx
git commit -m "feat: add Sidebar and SidebarLink components"
```

---

## Task 5: StatsBar (TDD)

**Files:**

- Create: `src/components/dashboard/StatsBar.tsx`
- Create: `src/components/dashboard/StatsBar.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/StatsBar.test.tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatsBar } from "@/components/dashboard/StatsBar";
import type { EstadoServicio } from "@/lib/mock-data";

const proyectos: Array<{ estado: EstadoServicio }> = [
  { estado: "running" },
  { estado: "running" },
  { estado: "stopped" },
  { estado: "error" },
  { estado: "deploying" },
];

describe("StatsBar", () => {
  it("muestra el total de proyectos", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-total")).getByText("5"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos running", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-running")).getByText("2"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos stopped", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-stopped")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("cuenta los proyectos en error", () => {
    render(<StatsBar proyectos={proyectos} />);
    expect(
      within(screen.getByTestId("stat-error")).getByText("1"),
    ).toBeInTheDocument();
  });

  it("muestra 0 en categorías sin proyectos", () => {
    render(<StatsBar proyectos={[{ estado: "deploying" }]} />);
    expect(
      within(screen.getByTestId("stat-running")).getByText("0"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar para confirmar que falla**

```bash
npm run test:unit -- StatsBar
```

Salida esperada: `FAIL` — `Cannot find module '@/components/dashboard/StatsBar'`

- [ ] **Step 3: Implementar StatsBar**

```tsx
// src/components/dashboard/StatsBar.tsx
import type { EstadoServicio } from "@/lib/mock-data";

interface StatsBarProps {
  proyectos: Array<{ estado: EstadoServicio }>;
}

export function StatsBar({ proyectos }: StatsBarProps) {
  const total = proyectos.length;
  const running = proyectos.filter((p) => p.estado === "running").length;
  const stopped = proyectos.filter((p) => p.estado === "stopped").length;
  const error = proyectos.filter((p) => p.estado === "error").length;

  return (
    <div
      className="flex flex-wrap gap-3 mb-8"
      role="region"
      aria-label="resumen de estado"
    >
      <StatPill id="stat-total" count={total} label="total" />
      <StatPill
        id="stat-running"
        count={running}
        label="running"
        colorClass="text-state-running"
      />
      <StatPill
        id="stat-stopped"
        count={stopped}
        label="stopped"
        colorClass="text-state-stopped"
      />
      <StatPill
        id="stat-error"
        count={error}
        label="error"
        colorClass="text-state-error"
      />
    </div>
  );
}

function StatPill({
  id,
  count,
  label,
  colorClass = "text-text-muted",
}: {
  id: string;
  count: number;
  label: string;
  colorClass?: string;
}) {
  return (
    <div
      data-testid={id}
      className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-4 py-2"
    >
      <span className={`font-display text-xl font-bold ${colorClass}`}>
        {count}
      </span>
      <span className="font-body text-xs text-text-muted">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar para confirmar que pasa**

```bash
npm run test:unit -- StatsBar
```

Salida esperada: `PASS` — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/StatsBar.tsx src/components/dashboard/StatsBar.test.tsx
git commit -m "feat: add StatsBar component"
```

---

## Task 6: ProjectCard (TDD)

**Files:**

- Create: `src/components/dashboard/ProjectCard.tsx`
- Create: `src/components/dashboard/ProjectCard.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/ProjectCard.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import type { Proyecto } from "@/lib/mock-data";

const base: Proyecto = {
  id: "p1",
  nombre: "web-app",
  clienteSlug: "cliente-uno",
  estado: "running",
  servicios: [],
  dominio: "app.cliente-uno.com",
  ultimoDeploy: { hace: "hace 2h", rama: "main" },
};

describe("ProjectCard — contenido", () => {
  it("muestra el nombre del proyecto", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText("web-app")).toBeInTheDocument();
  });

  it("muestra el dominio cuando existe", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText("app.cliente-uno.com")).toBeInTheDocument();
  });

  it("muestra rama y tiempo del último deploy", () => {
    render(<ProjectCard proyecto={base} />);
    expect(screen.getByText(/main/)).toBeInTheDocument();
    expect(screen.getByText(/hace 2h/)).toBeInTheDocument();
  });

  it("no muestra dominio si es null", () => {
    render(<ProjectCard proyecto={{ ...base, dominio: null }} />);
    expect(screen.queryByText("app.cliente-uno.com")).not.toBeInTheDocument();
  });
});

describe("ProjectCard — acciones según estado", () => {
  it("running: muestra Stop, Restart y Deploy habilitados", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "running" }} />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
  });

  it("stopped: muestra Start y Deploy, sin Stop ni Restart", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "stopped" }} />);
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /restart/i }),
    ).not.toBeInTheDocument();
  });

  it("error: muestra Start, Restart y Deploy", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "error" }} />);
    expect(screen.getByRole("button", { name: /start/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /restart/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeEnabled();
  });

  it("deploying: muestra solo el botón Deploy deshabilitado, sin otras acciones", () => {
    render(<ProjectCard proyecto={{ ...base, estado: "deploying" }} />);
    expect(
      screen.queryByRole("button", { name: /stop/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /restart/i }),
    ).not.toBeInTheDocument();
    const deployBtn = screen.getByRole("button", { name: /deploying/i });
    expect(deployBtn).toBeDisabled();
  });
});
```

- [ ] **Step 2: Ejecutar para confirmar que falla**

```bash
npm run test:unit -- ProjectCard
```

Salida esperada: `FAIL` — `Cannot find module '@/components/dashboard/ProjectCard'`

- [ ] **Step 3: Implementar ProjectCard**

```tsx
// src/components/dashboard/ProjectCard.tsx
"use client";

import { useState } from "react";
import type { Proyecto } from "@/lib/mock-data";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ proyecto }: { proyecto: Proyecto }) {
  const [loading, setLoading] = useState(false);
  const isDeploying = proyecto.estado === "deploying" || loading;

  function handleAction(accion: string) {
    setLoading(true);
    // stub: se reemplazará con mutación tRPC
    console.log(`[ProjectCard] ${accion} → ${proyecto.id}`);
    setTimeout(() => setLoading(false), 1500);
  }

  return (
    <div className="bg-surface border border-border rounded-[var(--radius-md)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {proyecto.nombre}
        </h3>
        <StatusBadge estado={proyecto.estado} />
      </div>

      {proyecto.dominio && (
        <p className="font-body text-xs text-text-muted truncate">
          {proyecto.dominio}
        </p>
      )}

      {proyecto.ultimoDeploy && (
        <p className="font-body text-xs text-text-muted">
          {proyecto.ultimoDeploy.rama} · {proyecto.ultimoDeploy.hace}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {!isDeploying && proyecto.estado === "running" && (
          <ActionButton onClick={() => handleAction("stop")}>Stop</ActionButton>
        )}
        {!isDeploying &&
          (proyecto.estado === "stopped" || proyecto.estado === "error") && (
            <ActionButton onClick={() => handleAction("start")}>
              Start
            </ActionButton>
          )}
        {!isDeploying &&
          (proyecto.estado === "running" || proyecto.estado === "error") && (
            <ActionButton onClick={() => handleAction("restart")}>
              Restart
            </ActionButton>
          )}
        <ActionButton
          onClick={() => handleAction("deploy")}
          disabled={isDeploying}
          primary
        >
          {isDeploying ? "Deploying..." : "Deploy"}
        </ActionButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border transition-opacity duration-[var(--duration-fast)] disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-700"
          : "bg-transparent border-border text-text-primary hover:border-primary-300"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Ejecutar para confirmar que pasa**

```bash
npm run test:unit -- ProjectCard
```

Salida esperada: `PASS` — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ProjectCard.tsx src/components/dashboard/ProjectCard.test.tsx
git commit -m "feat: add ProjectCard component with conditional actions"
```

---

## Task 7: ClientSection (TDD)

**Files:**

- Create: `src/components/dashboard/ClientSection.tsx`
- Create: `src/components/dashboard/ClientSection.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

```tsx
// src/components/dashboard/ClientSection.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ClientSection } from "@/components/dashboard/ClientSection";
import type { Cliente } from "@/lib/mock-data";

const cliente: Cliente = {
  slug: "cliente-test",
  nombre: "Cliente Test",
  proyectos: [
    {
      id: "p1",
      nombre: "web-app",
      clienteSlug: "cliente-test",
      estado: "running",
      servicios: [],
      dominio: null,
      ultimoDeploy: null,
    },
    {
      id: "p2",
      nombre: "api",
      clienteSlug: "cliente-test",
      estado: "stopped",
      servicios: [],
      dominio: null,
      ultimoDeploy: null,
    },
  ],
};

describe("ClientSection", () => {
  it("muestra el nombre del cliente", () => {
    render(<ClientSection cliente={cliente} />);
    expect(screen.getByText("Cliente Test")).toBeInTheDocument();
  });

  it("renderiza una tarjeta por proyecto", () => {
    render(<ClientSection cliente={cliente} />);
    expect(screen.getByText("web-app")).toBeInTheDocument();
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("renderiza cero tarjetas si el cliente no tiene proyectos", () => {
    render(<ClientSection cliente={{ ...cliente, proyectos: [] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar para confirmar que falla**

```bash
npm run test:unit -- ClientSection
```

Salida esperada: `FAIL` — `Cannot find module '@/components/dashboard/ClientSection'`

- [ ] **Step 3: Implementar ClientSection**

```tsx
// src/components/dashboard/ClientSection.tsx
import type { Cliente } from "@/lib/mock-data";
import { ProjectCard } from "./ProjectCard";

export function ClientSection({ cliente }: { cliente: Cliente }) {
  return (
    <section aria-label={cliente.nombre}>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest whitespace-nowrap">
          {cliente.nombre}
        </h2>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cliente.proyectos.map((proyecto) => (
          <ProjectCard key={proyecto.id} proyecto={proyecto} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Ejecutar para confirmar que pasa**

```bash
npm run test:unit -- ClientSection
```

Salida esperada: `PASS` — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ClientSection.tsx src/components/dashboard/ClientSection.test.tsx
git commit -m "feat: add ClientSection component"
```

---

## Task 8: Route group (panel) y dashboard page

**Files:**

- Create: `src/app/(panel)/layout.tsx`
- Create: `src/app/(panel)/page.tsx`
- Delete: `src/app/page.tsx`

No hay tests (Infrastructure tier — `src/app/**` excluido de cobertura según `vitest.config.ts`).

- [ ] **Step 1: Crear el layout del route group**

```tsx
// src/app/(panel)/layout.tsx
import { Sidebar } from "@/components/layout/Sidebar";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 bg-background">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Crear la dashboard page**

```tsx
// src/app/(panel)/page.tsx
import { clientes } from "@/lib/mock-data";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { ClientSection } from "@/components/dashboard/ClientSection";

export default function DashboardPage() {
  const proyectosPlanos = clientes.flatMap((c) => c.proyectos);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Dashboard
      </h1>
      <StatsBar proyectos={proyectosPlanos} />
      <div className="flex flex-col gap-8">
        {clientes.map((cliente) => (
          <ClientSection key={cliente.slug} cliente={cliente} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Eliminar src/app/page.tsx**

```bash
git rm src/app/page.tsx
```

Razón: el route group `(panel)` sirve la ruta `/` mediante `src/app/(panel)/page.tsx`. Mantener ambos causaría conflicto en Next.js.

- [ ] **Step 4: Verificar tipos**

```bash
npm run type-check
```

Salida esperada: sin errores.

- [ ] **Step 5: Ejecutar todos los tests**

```bash
npm run test:unit
```

Salida esperada: todos los tests pasan.

- [ ] **Step 6: Arrancar el servidor de desarrollo y verificar visualmente**

```bash
npm run dev
```

Abrir `http://localhost:3000`. Verificar:

- [ ] Sidebar visible con VICALBA + tres enlaces de navegación
- [ ] "Dashboard" resaltado como ítem activo en la nav
- [ ] Barra de métricas con 4 pills (total, running, stopped, error) con números correctos
- [ ] Dos secciones: "Cliente Uno" y "Cliente Dos"
- [ ] 4 tarjetas de proyecto con nombre, estado, dominio, rama/tiempo
- [ ] Tarjeta `web-app` (running): botones Stop, Restart, Deploy
- [ ] Tarjeta `api` (stopped): botones Start, Deploy
- [ ] Tarjeta `landing` (error): botones Start, Restart, Deploy
- [ ] Tarjeta `worker` (deploying): solo botón "Deploying..." deshabilitado

- [ ] **Step 7: Commit**

```bash
git add src/app/\(panel\)/layout.tsx src/app/\(panel\)/page.tsx
git commit -m "feat: add panel layout and dashboard page with mock data"
```

---

## Verificación final de cobertura

- [ ] Ejecutar con cobertura para confirmar que `src/components/**` supera el 80%

```bash
npm run test:unit -- --coverage
```

Salida esperada: `src/components/` supera el umbral de `80%` en branches, functions, lines y statements. Si algún fichero no llega, añadir tests para los casos no cubiertos antes de marcar el plan como completado.
