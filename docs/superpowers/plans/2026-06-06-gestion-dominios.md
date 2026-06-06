# Gestión de Dominios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar la conexión de Traefik a redes de cliente al gestionar proyectos con dominio, y mostrar el estado SSL en el detalle del proyecto.

**Architecture:** Dos módulos nuevos (`src/lib/docker/traefik.ts` y `src/lib/ssl/acme.ts`) integrados en el router de proyectos y en la página de detalle. El módulo traefik.ts usa dockerode para conectar/desconectar el contenedor Traefik a redes de cliente. El módulo acme.ts lee el archivo `acme.json` de Traefik para detectar si el certificado SSL ya fue emitido.

**Tech Stack:** dockerode, Node.js fs/promises, Prisma, tRPC, Next.js App Router Server Components, Vitest

---

## File map

| Acción | Fichero                                      |
| ------ | -------------------------------------------- |
| Editar | `src/env.ts`                                 |
| Crear  | `src/lib/docker/traefik.ts`                  |
| Crear  | `src/lib/docker/traefik.test.ts`             |
| Crear  | `src/lib/ssl/acme.ts`                        |
| Crear  | `src/lib/ssl/acme.test.ts`                   |
| Editar | `src/server/routers/proyectos.ts`            |
| Editar | `src/server/routers/proyectos.test.ts`       |
| Crear  | `src/components/dashboard/SSLBadge.tsx`      |
| Crear  | `src/components/dashboard/SSLBadge.test.tsx` |
| Editar | `src/app/(panel)/proyectos/[id]/page.tsx`    |

---

### Task 1: Variables de entorno + src/lib/docker/traefik.ts (TDD)

**Files:**

- Modify: `src/env.ts`
- Create: `src/lib/docker/traefik.test.ts`
- Create: `src/lib/docker/traefik.ts`

- [ ] **Step 1: Añadir las nuevas variables de entorno a src/env.ts**

En `src/env.ts`, dentro de `serverSchema`, añade después de `REPOS_DIR`:

```typescript
  TRAEFIK_CONTAINER_NAME: z.string().default("traefik"),
  ACME_JSON_PATH: z
    .string()
    .default("/var/vicalba/traefik/acme.json"),
```

- [ ] **Step 2: Escribir los tests de traefik.ts**

Crea `src/lib/docker/traefik.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListContainers,
  mockGetNetwork,
  mockNetworkConnect,
  mockNetworkDisconnect,
} = vi.hoisted(() => ({
  mockListContainers: vi.fn(),
  mockGetNetwork: vi.fn(),
  mockNetworkConnect: vi.fn(),
  mockNetworkDisconnect: vi.fn(),
}));

vi.mock("./client", () => ({
  docker: {
    listContainers: mockListContainers,
    getNetwork: mockGetNetwork,
  },
}));

vi.mock("@/env", () => ({
  env: {
    TRAEFIK_CONTAINER_NAME: "traefik",
    DOCKER_SOCKET_PATH: "/var/run/docker.sock",
    ACME_JSON_PATH: "/var/vicalba/traefik/acme.json",
  },
}));

import { conectarTraefikARed, desconectarTraefikDeRed } from "./traefik";

const mockTraefik = { Id: "abc123", Names: ["/traefik"] };

describe("conectarTraefikARed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockReturnValue({
      connect: mockNetworkConnect,
      disconnect: mockNetworkDisconnect,
    });
  });

  it("conecta Traefik a la red del cliente con el nombre correcto", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkConnect.mockResolvedValue(undefined);

    await conectarTraefikARed("acme");

    expect(mockGetNetwork).toHaveBeenCalledWith("cliente-acme-network");
    expect(mockNetworkConnect).toHaveBeenCalledWith({ Container: "abc123" });
  });

  it("absorbe error si el contenedor ya estaba conectado a la red", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkConnect.mockRejectedValue(
      new Error("already exists in network"),
    );

    await expect(conectarTraefikARed("acme")).resolves.not.toThrow();
  });

  it("no hace nada si no hay contenedor traefik", async () => {
    mockListContainers.mockResolvedValue([]);

    await expect(conectarTraefikARed("acme")).resolves.not.toThrow();
    expect(mockNetworkConnect).not.toHaveBeenCalled();
  });
});

describe("desconectarTraefikDeRed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNetwork.mockReturnValue({
      connect: mockNetworkConnect,
      disconnect: mockNetworkDisconnect,
    });
  });

  it("desconecta Traefik de la red del cliente", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkDisconnect.mockResolvedValue(undefined);

    await desconectarTraefikDeRed("acme");

    expect(mockGetNetwork).toHaveBeenCalledWith("cliente-acme-network");
    expect(mockNetworkDisconnect).toHaveBeenCalledWith({ Container: "abc123" });
  });

  it("absorbe error si no estaba conectado", async () => {
    mockListContainers.mockResolvedValue([mockTraefik]);
    mockNetworkDisconnect.mockRejectedValue(new Error("not connected"));

    await expect(desconectarTraefikDeRed("acme")).resolves.not.toThrow();
  });

  it("no hace nada si no hay contenedor traefik", async () => {
    mockListContainers.mockResolvedValue([]);

    await expect(desconectarTraefikDeRed("acme")).resolves.not.toThrow();
    expect(mockNetworkDisconnect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Ejecutar los tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/docker/traefik.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 4: Implementar src/lib/docker/traefik.ts**

Crea `src/lib/docker/traefik.ts`:

```typescript
import { env } from "@/env";
import { docker } from "./client";

const nombreRed = (clienteSlug: string) => `cliente-${clienteSlug}-network`;

async function encontrarContenedorTraefik() {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [env.TRAEFIK_CONTAINER_NAME] },
  });
  return containers.find((c) =>
    c.Names.some((n) => n === `/${env.TRAEFIK_CONTAINER_NAME}`),
  );
}

export async function conectarTraefikARed(clienteSlug: string): Promise<void> {
  const traefik = await encontrarContenedorTraefik();
  if (!traefik) return;
  const network = docker.getNetwork(nombreRed(clienteSlug));
  try {
    await network.connect({ Container: traefik.Id });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) return;
    throw err;
  }
}

export async function desconectarTraefikDeRed(
  clienteSlug: string,
): Promise<void> {
  const traefik = await encontrarContenedorTraefik();
  if (!traefik) return;
  const network = docker.getNetwork(nombreRed(clienteSlug));
  try {
    await network.disconnect({ Container: traefik.Id });
  } catch {
    // absorb — no estaba conectado
  }
}
```

- [ ] **Step 5: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/docker/traefik.test.ts
```

Expected: 6 tests pasan.

- [ ] **Step 6: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/env.ts src/lib/docker/traefik.ts src/lib/docker/traefik.test.ts
git commit -m "feat: conectarTraefikARed y desconectarTraefikDeRed"
```

---

### Task 2: src/lib/ssl/acme.ts (TDD)

**Files:**

- Create: `src/lib/ssl/acme.test.ts`
- Create: `src/lib/ssl/acme.ts`

- [ ] **Step 1: Escribir los tests de acme.ts**

Crea `src/lib/ssl/acme.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));
vi.mock("@/env", () => ({
  env: { ACME_JSON_PATH: "/var/vicalba/traefik/acme.json" },
}));

import { leerEstadoSSL } from "./acme";

const acmeConCerts = JSON.stringify({
  letsencrypt: {
    Certificates: [
      { domain: { main: "app.ejemplo.com" } },
      { domain: { main: "otro.ejemplo.com" } },
    ],
  },
});

describe("leerEstadoSSL", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve activo: true si el dominio tiene certificado", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: true, expira: null });
  });

  it("devuelve activo: false si el dominio no está en los certificados", async () => {
    mockReadFile.mockResolvedValue(acmeConCerts);
    const result = await leerEstadoSSL("noexiste.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si acme.json no existe", async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si acme.json está malformado", async () => {
    mockReadFile.mockResolvedValue("{ invalid json }");
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });

  it("devuelve activo: false si no hay Certificates en el resolver", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ letsencrypt: { Account: {} } }),
    );
    const result = await leerEstadoSSL("app.ejemplo.com");
    expect(result).toEqual({ activo: false, expira: null });
  });
});
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/ssl/acme.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar src/lib/ssl/acme.ts**

Crea el directorio `src/lib/ssl/` y el fichero `src/lib/ssl/acme.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { env } from "@/env";

interface AcmeJson {
  [resolver: string]: {
    Certificates?: Array<{
      domain: { main: string; sans?: string[] };
    }>;
  };
}

export async function leerEstadoSSL(
  dominio: string,
): Promise<{ activo: boolean; expira: Date | null }> {
  try {
    const content = await readFile(env.ACME_JSON_PATH, "utf-8");
    const data = JSON.parse(content) as AcmeJson;
    const certs = Object.values(data).flatMap((r) => r.Certificates ?? []);
    const activo = certs.some((c) => c.domain.main === dominio);
    return { activo, expira: null };
  } catch {
    return { activo: false, expira: null };
  }
}
```

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/ssl/acme.test.ts
```

Expected: 5 tests pasan.

- [ ] **Step 5: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ssl/acme.ts src/lib/ssl/acme.test.ts
git commit -m "feat: leerEstadoSSL lee acme.json de Traefik"
```

---

### Task 3: proyectosRouter — Traefik auto-connect + procedure estadoSSL (TDD)

**Files:**

- Modify: `src/server/routers/proyectos.test.ts`
- Modify: `src/server/routers/proyectos.ts`

Contexto: `proyectos.ts` importa de `@/lib/docker/networks` y `@/lib/traefik/config`. Necesita importar también de `@/lib/docker/traefik` y `@/lib/ssl/acme`.

- [ ] **Step 1: Añadir mocks de traefik y acme en proyectos.test.ts**

En `src/server/routers/proyectos.test.ts`, añade estos dos bloques `vi.mock` después de los existentes (por ejemplo, después del mock de `@/lib/docker/networks`):

```typescript
vi.mock("@/lib/docker/traefik", () => ({
  conectarTraefikARed: vi.fn().mockResolvedValue(undefined),
  desconectarTraefikDeRed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ssl/acme", () => ({
  leerEstadoSSL: vi.fn().mockResolvedValue({ activo: true, expira: null }),
}));
```

Añade los imports correspondientes junto a los demás imports del test:

```typescript
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { leerEstadoSSL } from "@/lib/ssl/acme";
```

También añade `count: vi.fn()` al mock de `prisma.proyecto` (ya existe `count` en `eliminar`, comprueba que está):

El mock de `prisma.proyecto` debe tener:

```typescript
proyecto: {
  findUnique: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
},
```

- [ ] **Step 2: Añadir tests de Traefik a crear, editar, eliminar y estadoSSL**

Al final del fichero `src/server/routers/proyectos.test.ts`, añade:

```typescript
describe("proyectos — integración Traefik redes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(conectarTraefikARed).mockResolvedValue(undefined);
    vi.mocked(desconectarTraefikDeRed).mockResolvedValue(undefined);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);
  });

  it("crear con dominio llama conectarTraefikARed", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
      dominio: "app.ejemplo.com",
      servicios: ["nginx"],
    });

    expect(conectarTraefikARed).toHaveBeenCalledWith("cliente-uno");
  });

  it("crear sin dominio no llama conectarTraefikARed", async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(
      mockClienteRow as never,
    );
    vi.mocked(prisma.proyecto.create).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.crear({
      clienteId: "c1",
      nombre: "web-app",
      servicios: ["nginx"],
    });

    expect(conectarTraefikARed).not.toHaveBeenCalled();
  });

  it("editar añadiendo dominio llama conectarTraefikARed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: "nuevo.ejemplo.com",
      cliente: mockClienteRow,
    } as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      dominio: "nuevo.ejemplo.com",
      servicios: ["nginx"],
    });

    expect(conectarTraefikARed).toHaveBeenCalledWith("cliente-uno");
  });

  it("editar quitando dominio (sin otros con dominio) llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "viejo.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      servicios: ["nginx"],
    });

    expect(desconectarTraefikDeRed).toHaveBeenCalledWith("cliente-uno");
  });

  it("editar quitando dominio (hay otros con dominio) no llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "viejo.ejemplo.com",
    } as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      dominio: null,
      cliente: mockClienteRow,
    } as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(1);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.editar({
      id: "p1",
      nombre: "web-app",
      servicios: ["nginx"],
    });

    expect(desconectarTraefikDeRed).not.toHaveBeenCalled();
  });

  it("eliminar con dominio (último del cliente) llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
    } as never);
    vi.mocked(prisma.servicio.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count).mockResolvedValue(0);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(desconectarTraefikDeRed).toHaveBeenCalledWith("cliente-uno");
  });

  it("eliminar con dominio (quedan otros con dominio) no llama desconectarTraefikDeRed", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      dominio: "app.ejemplo.com",
    } as never);
    vi.mocked(prisma.servicio.deleteMany).mockResolvedValue({
      count: 1,
    } as never);
    vi.mocked(prisma.proyecto.delete).mockResolvedValue(mockProyecto as never);
    vi.mocked(prisma.proyecto.count)
      .mockResolvedValueOnce(1) // otrosConDominio
      .mockResolvedValueOnce(1); // restantes (para eliminarRedCliente)

    const ctx = await createContext();
    await createCaller(ctx).proyectos.eliminar({ id: "p1" });

    expect(desconectarTraefikDeRed).not.toHaveBeenCalled();
  });
});

describe("proyectos.estadoSSL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve el estado SSL del dominio", async () => {
    vi.mocked(leerEstadoSSL).mockResolvedValue({ activo: true, expira: null });

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.estadoSSL({
      dominio: "app.ejemplo.com",
    });

    expect(leerEstadoSSL).toHaveBeenCalledWith("app.ejemplo.com");
    expect(result).toEqual({ activo: true, expira: null });
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.estadoSSL({ dominio: "app.ejemplo.com" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 3: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/server/routers/proyectos.test.ts
```

Expected: FAIL en los nuevos tests.

- [ ] **Step 4: Actualizar proyectos.ts — imports**

En `src/server/routers/proyectos.ts`, añade los imports:

```typescript
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { leerEstadoSSL } from "@/lib/ssl/acme";
```

- [ ] **Step 5: Actualizar procedure crear en proyectos.ts**

En el procedure `crear`, después de `await escribirConfigTraefik(...)`, añade:

```typescript
      if (creado.dominio) {
        const yaml = generarConfigTraefik({...});
        await escribirConfigTraefik(creado.nombre, yaml);
        await conectarTraefikARed(creado.cliente.slug);
      }
```

El bloque completo queda:

```typescript
await asegurarRedCliente(creado.cliente.slug);

if (creado.dominio) {
  const yaml = generarConfigTraefik({
    dominio: creado.dominio,
    proyectoSlug: creado.nombre,
    clienteSlug: creado.cliente.slug,
  });
  await escribirConfigTraefik(creado.nombre, yaml);
  await conectarTraefikARed(creado.cliente.slug);
}

return creado;
```

- [ ] **Step 6: Actualizar procedure editar en proyectos.ts**

Al final del procedure `editar`, después del bloque if/else de Traefik config, añade:

```typescript
if (!proyecto.dominio && actualizado.dominio) {
  await conectarTraefikARed(proyecto.cliente.slug);
} else if (proyecto.dominio && !actualizado.dominio) {
  const otrosConDominio = await prisma.proyecto.count({
    where: {
      clienteId: proyecto.clienteId,
      dominio: { not: null },
      id: { not: input.id },
    },
  });
  if (otrosConDominio === 0)
    await desconectarTraefikDeRed(proyecto.cliente.slug);
}

return actualizado;
```

- [ ] **Step 7: Actualizar procedure eliminar en proyectos.ts**

En el procedure `eliminar`, reemplaza el bloque Traefik:

```typescript
if (proyecto.dominio) {
  await eliminarConfigTraefik(proyecto.nombre);
  const otrosConDominio = await prisma.proyecto.count({
    where: {
      clienteId: proyecto.clienteId,
      dominio: { not: null },
      id: { not: input.id },
    },
  });
  if (otrosConDominio === 0)
    await desconectarTraefikDeRed(proyecto.cliente.slug);
}
```

- [ ] **Step 8: Añadir procedure estadoSSL en proyectos.ts**

Añade antes del procedure `listar`:

```typescript
  estadoSSL: protectedProcedure
    .input(z.object({ dominio: z.string() }))
    .query(async ({ input }) => {
      return leerEstadoSSL(input.dominio);
    }),
```

- [ ] **Step 9: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/server/routers/proyectos.test.ts
```

Expected: todos los tests pasan.

- [ ] **Step 10: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 11: Commit**

```bash
git add src/server/routers/proyectos.ts src/server/routers/proyectos.test.ts
git commit -m "feat: Traefik auto-connect en crear/editar/eliminar y procedure estadoSSL"
```

---

### Task 4: SSLBadge component + page.tsx

**Files:**

- Create: `src/components/dashboard/SSLBadge.test.tsx`
- Create: `src/components/dashboard/SSLBadge.tsx`
- Modify: `src/app/(panel)/proyectos/[id]/page.tsx`

- [ ] **Step 1: Escribir tests de SSLBadge**

Crea `src/components/dashboard/SSLBadge.test.tsx`:

```typescript
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
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/components/dashboard/SSLBadge.test.tsx
```

Expected: FAIL — componente no existe.

- [ ] **Step 3: Crear SSLBadge.tsx**

Crea `src/components/dashboard/SSLBadge.tsx`:

```tsx
export function SSLBadge({
  estado,
}: {
  estado: { activo: boolean; expira: Date | null };
}) {
  if (estado.activo) {
    return (
      <span className="font-body text-xs text-state-running">● SSL activo</span>
    );
  }
  return (
    <span className="font-body text-xs text-state-deploying">
      ○ SSL pendiente
    </span>
  );
}
```

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/components/dashboard/SSLBadge.test.tsx
```

Expected: 2 tests pasan.

- [ ] **Step 5: Actualizar page.tsx**

En `src/app/(panel)/proyectos/[id]/page.tsx`:

**a)** Añade el import de SSLBadge junto al resto:

```typescript
import { SSLBadge } from "@/components/dashboard/SSLBadge";
```

**b)** La sección `<Campo label="Dominio" ...>` está dentro del grid. Reemplázala con:

```tsx
<div className="flex flex-col gap-1">
  <span className="font-body text-xs text-text-muted">Dominio</span>
  {proyecto.dominio ? (
    <div className="flex flex-col gap-1">
      <span className="font-body text-sm text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all">
        {proyecto.dominio}
      </span>
      <SSLBadge
        estado={await api.proyectos.estadoSSL({
          dominio: proyecto.dominio,
        })}
      />
    </div>
  ) : (
    <span className="font-body text-sm text-text-primary">—</span>
  )}
</div>
```

- [ ] **Step 6: Ejecutar todos los tests**

```bash
npm run test:unit
```

Expected: todos los tests pasan.

- [ ] **Step 7: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/SSLBadge.tsx src/components/dashboard/SSLBadge.test.tsx "src/app/(panel)/proyectos/[id]/page.tsx"
git commit -m "feat: SSLBadge e integración en página de detalle de proyecto"
```

---

## Verificación final

```bash
npm run test:unit -- --coverage
npm run type-check
```

- Cobertura `src/lib/docker/traefik.ts`: 100% ✓
- Cobertura `src/lib/ssl/acme.ts`: 100% ✓
- Cobertura `src/server/routers/proyectos.ts`: 100% ✓
- Cobertura `src/components/dashboard/SSLBadge.tsx`: ≥80% ✓
- type-check sin errores ✓
