# Historial de Deploys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar cada deploy en una tabla `Deploy` de la base de datos, capturar su output, y mostrar los últimos 20 en una nueva sección de `/proyectos/[id]`.

**Architecture:** Un nuevo modelo `Deploy` en Prisma almacena cada deploy iniciado (desde tRPC o webhook). Una nueva función `ejecutarDeploy()` en `src/lib/docker/deploys.ts` orquesta el flujo: crea el registro `en_curso`, llama a `deployProyecto()` (que ahora devuelve el output capturado), actualiza el registro con el resultado, y nunca lanza. Los dos callers existentes (router y webhook) se actualizan para usar `ejecutarDeploy`. Un nuevo procedure `listarDeploys` en tRPC alimenta el componente Server Component `HistorialDeploys` que se añade debajo de Variables en la página de detalle del proyecto.

**Tech Stack:** Prisma + PostgreSQL, tRPC, Next.js App Router Server Components, Vitest, @testing-library/react

---

## File map

| Acción | Fichero                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| Editar | `prisma/schema.prisma`                                                         |
| Crear  | `prisma/migrations/<timestamp>_add_deploy_history/` (generada por migrate dev) |
| Editar | `src/lib/docker/deploy.ts`                                                     |
| Crear  | `src/lib/docker/deploys.ts`                                                    |
| Crear  | `src/lib/docker/deploys.test.ts`                                               |
| Editar | `src/server/routers/proyectos.ts`                                              |
| Editar | `src/server/routers/proyectos.test.ts`                                         |
| Editar | `src/app/api/webhooks/github/route.ts`                                         |
| Crear  | `src/components/dashboard/HistorialDeploys.tsx`                                |
| Crear  | `src/components/dashboard/HistorialDeploys.test.tsx`                           |
| Editar | `src/app/(panel)/proyectos/[id]/page.tsx`                                      |

---

### Task 1: Schema — enum ResultadoDeploy + modelo Deploy + migración

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Añadir el enum y el modelo a schema.prisma**

En `prisma/schema.prisma`, después del enum `EstadoServicio` añade el nuevo enum, y en el modelo `Proyecto` añade la relación. Finalmente añade el modelo `Deploy` al final del fichero:

```prisma
// Después de "enum EstadoServicio { ... }"

enum ResultadoDeploy {
  en_curso
  exito
  error
}
```

En el modelo `Proyecto`, añade la línea de relación justo antes de `creadoEn`:

```prisma
  deploys      Deploy[]
  creadoEn     DateTime       @default(now())
```

Al final del fichero, añade el modelo `Deploy`:

```prisma
model Deploy {
  id           String          @id @default(cuid())
  proyecto     Proyecto        @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  proyectoId   String
  rama         String
  resultado    ResultadoDeploy @default(en_curso)
  output       String?
  iniciadoEn   DateTime        @default(now())
  finalizadoEn DateTime?

  @@index([proyectoId, iniciadoEn(sort: Desc)])
}
```

- [ ] **Step 2: Ejecutar la migración**

```bash
npx prisma migrate dev --name add_deploy_history
```

Expected: Prisma crea la carpeta `prisma/migrations/<timestamp>_add_deploy_history/` con el SQL, y regenera el Prisma Client.

- [ ] **Step 3: Verificar que el build no tiene errores de tipos**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: modelo Deploy y enum ResultadoDeploy en schema"
```

---

### Task 2: Modificar deployProyecto para retornar Promise\<string\>

**Files:**

- Modify: `src/lib/docker/deploy.ts`

- [ ] **Step 1: Actualizar la firma y capturar el output en deploy.ts**

Reemplaza la función `deployProyecto` completa con:

```typescript
export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<string> {
  const { repoUrl, rama, clienteSlug, proyectoNombre, servicios, variables } =
    params;
  const repoDir = `${env.REPOS_DIR}/${clienteSlug}/${proyectoNombre}`;
  const overridePath = `${repoDir}/docker-compose.network.yml`;
  const envFilePath = `${repoDir}/.env.panel`;

  await ensureRepo(repoUrl, repoDir);
  await execFileAsync("git", ["-C", repoDir, "checkout", rama]);
  await execFileAsync("git", ["-C", repoDir, "pull"]);

  const overrideYaml = generarComposeOverride(clienteSlug, servicios);
  await writeFile(overridePath, overrideYaml, "utf-8");

  const hasVars = variables && variables.length > 0;

  if (hasVars) {
    const envContent = variables
      .map(({ clave, valor }) => `${clave}=${valor}`)
      .join("\n");
    await writeFile(envFilePath, envContent, "utf-8");
  }

  const composeArgs = [
    "compose",
    "-f",
    `${repoDir}/docker-compose.yml`,
    "-f",
    overridePath,
    ...(hasVars ? ["--env-file", envFilePath] : []),
    "up",
    "--build",
    "-d",
    "--force-recreate",
  ];

  let output = "";
  try {
    const { stdout, stderr } = await execFileAsync("docker", composeArgs);
    output = stdout + "\n" + stderr;
  } finally {
    if (hasVars) {
      await unlink(envFilePath).catch(() => {});
    }
  }
  return output;
}
```

- [ ] **Step 2: Ejecutar los tests existentes — deben pasar sin cambios**

```bash
npx vitest run src/lib/docker/deploy.test.ts
```

Expected: todos los tests pasan. Los tests existentes no comprueban el valor de retorno, solo el comportamiento de escritura de ficheros y limpieza.

- [ ] **Step 3: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/docker/deploy.ts
git commit -m "feat: deployProyecto retorna Promise<string> con stdout+stderr"
```

---

### Task 3: Crear ejecutarDeploy en src/lib/docker/deploys.ts (TDD)

**Files:**

- Create: `src/lib/docker/deploys.test.ts`
- Create: `src/lib/docker/deploys.ts`

- [ ] **Step 1: Escribir el fichero de tests**

Crea `src/lib/docker/deploys.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeployProyecto, mockDeployCreate, mockDeployUpdate } = vi.hoisted(
  () => ({
    mockDeployProyecto: vi.fn(),
    mockDeployCreate: vi.fn(),
    mockDeployUpdate: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock("./deploy", () => ({ deployProyecto: mockDeployProyecto }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deploy: {
      create: mockDeployCreate,
      update: mockDeployUpdate,
    },
  },
}));

import { ejecutarDeploy } from "./deploys";

const baseParams = {
  proyectoId: "p1",
  repoUrl: "https://github.com/org/repo",
  rama: "main",
  clienteSlug: "acme",
  proyectoNombre: "web-app",
  servicios: ["nginx"],
};

describe("ejecutarDeploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployCreate.mockResolvedValue({ id: "d1" });
    mockDeployUpdate.mockResolvedValue({});
  });

  it("crea registro Deploy con estado en_curso al inicio", async () => {
    mockDeployProyecto.mockResolvedValue("");
    await ejecutarDeploy(baseParams);
    expect(mockDeployCreate).toHaveBeenCalledWith({
      data: { proyectoId: "p1", rama: "main", resultado: "en_curso" },
    });
  });

  it("en éxito actualiza el registro con resultado exito, output y finalizadoEn", async () => {
    mockDeployProyecto.mockResolvedValue("build output");
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          resultado: "exito",
          output: "build output",
          finalizadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it("en éxito retorna { resultado: 'exito', output }", async () => {
    mockDeployProyecto.mockResolvedValue("build output");
    const result = await ejecutarDeploy(baseParams);
    expect(result).toEqual({ resultado: "exito", output: "build output" });
  });

  it("en error actualiza el registro con resultado error y stdout+stderr del error", async () => {
    const err = Object.assign(new Error("build failed"), {
      stdout: "partial output",
      stderr: "error log",
    });
    mockDeployProyecto.mockRejectedValue(err);
    await ejecutarDeploy(baseParams);
    expect(mockDeployUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1" },
        data: expect.objectContaining({
          resultado: "error",
          output: "partial output\nerror log",
          finalizadoEn: expect.any(Date),
        }),
      }),
    );
  });

  it("en error retorna { resultado: 'error', output }", async () => {
    const err = Object.assign(new Error("build failed"), {
      stdout: "partial",
      stderr: "err",
    });
    mockDeployProyecto.mockRejectedValue(err);
    const result = await ejecutarDeploy(baseParams);
    expect(result).toEqual({ resultado: "error", output: "partial\nerr" });
  });

  it("en error usa el mensaje del error cuando no hay stdout/stderr", async () => {
    mockDeployProyecto.mockRejectedValue(new Error("network timeout"));
    const result = await ejecutarDeploy(baseParams);
    expect(result.resultado).toBe("error");
    expect(result.output).toBe("network timeout");
  });

  it("nunca lanza aunque deployProyecto falle", async () => {
    mockDeployProyecto.mockRejectedValue(new Error("fatal"));
    await expect(ejecutarDeploy(baseParams)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla (red)**

```bash
npx vitest run src/lib/docker/deploys.test.ts
```

Expected: FAIL — `Cannot find module './deploys'`.

- [ ] **Step 3: Implementar ejecutarDeploy en deploys.ts**

Crea `src/lib/docker/deploys.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { deployProyecto } from "./deploy";

export async function ejecutarDeploy(params: {
  proyectoId: string;
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<{ resultado: "exito" | "error"; output: string }> {
  const { proyectoId, ...deployParams } = params;

  const registro = await prisma.deploy.create({
    data: { proyectoId, rama: deployParams.rama, resultado: "en_curso" },
  });

  try {
    const output = await deployProyecto(deployParams);
    await prisma.deploy.update({
      where: { id: registro.id },
      data: { resultado: "exito", output, finalizadoEn: new Date() },
    });
    return { resultado: "exito", output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    const output =
      [e.stdout ?? "", e.stderr ?? ""].filter(Boolean).join("\n") ||
      (err instanceof Error ? err.message : String(err));
    await prisma.deploy.update({
      where: { id: registro.id },
      data: { resultado: "error", output, finalizadoEn: new Date() },
    });
    return { resultado: "error", output };
  }
}
```

- [ ] **Step 4: Ejecutar los tests para confirmar que pasan (green)**

```bash
npx vitest run src/lib/docker/deploys.test.ts
```

Expected: todos los tests pasan.

- [ ] **Step 5: Ejecutar todos los tests con cobertura para verificar el umbral 100%**

```bash
npx vitest run --coverage src/lib/docker/deploys.ts
```

Expected: 100% branches, functions, lines, statements.

- [ ] **Step 6: Commit**

```bash
git add src/lib/docker/deploys.ts src/lib/docker/deploys.test.ts
git commit -m "feat: ejecutarDeploy — orquesta deploy y registra en tabla Deploy"
```

---

### Task 4: Añadir listarDeploys y actualizar procedure deploy en proyectosRouter (TDD)

**Files:**

- Modify: `src/server/routers/proyectos.test.ts`
- Modify: `src/server/routers/proyectos.ts`

- [ ] **Step 1: Actualizar los mocks en proyectos.test.ts**

En `src/server/routers/proyectos.test.ts`, realiza estos cambios en la sección de mocks al inicio del fichero:

**a) Reemplaza** el mock de `@/lib/docker/deploy`:

```typescript
// ELIMINAR:
vi.mock("@/lib/docker/deploy", () => ({
  deployProyecto: vi.fn().mockResolvedValue(undefined),
}));

// AÑADIR:
vi.mock("@/lib/docker/deploys", () => ({
  ejecutarDeploy: vi.fn().mockResolvedValue({ resultado: "exito", output: "" }),
}));
```

**b) Añade** `deploy: { findMany: vi.fn() }` al mock de `@/lib/prisma`, dentro del objeto `prisma`:

```typescript
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: { findMany: vi.fn(), findUnique: vi.fn() },
    proyecto: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    servicio: { deleteMany: vi.fn() },
    variableEntorno: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    deploy: { findMany: vi.fn() },
  },
}));
```

**c) Actualiza los imports** — reemplaza:

```typescript
import { deployProyecto } from "@/lib/docker/deploy";
```

con:

```typescript
import { ejecutarDeploy } from "@/lib/docker/deploys";
```

- [ ] **Step 2: Reemplazar el describe "proyectos.deploy" con tests actualizados**

Reemplaza el bloque completo `describe("proyectos.deploy", ...)` con:

```typescript
describe("proyectos.deploy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
  });

  it("llama a ejecutarDeploy con proyectoId y actualiza estado a running en éxito", async () => {
    const proyecto = {
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
      rama: "main",
    };
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(proyecto as never);
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...proyecto,
      estado: "running",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoId: "p1",
        repoUrl: "https://github.com/org/repo",
        rama: "main",
        clienteSlug: "cliente-uno",
        proyectoNombre: "web-app",
        servicios: ["nginx", "node"],
      }),
    );
    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ estado: "running" }),
      }),
    );
    expect(result.estado).toBe("running");
  });

  it("actualiza estado a error cuando ejecutarDeploy retorna error", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: "https://github.com/org/repo",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "build failed",
    });
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyecto,
      estado: "error",
    } as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(prisma.proyecto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: "error" }),
      }),
    );
    expect(result.estado).toBe("error");
  });

  it("lanza CONFLICT si el proyecto está en estado deploying", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      estado: "deploying",
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lanza CONFLICT si falta repositorioUrl", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue({
      ...mockProyecto,
      repositorioUrl: null,
    } as never);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 3: Reemplazar el describe "proyectos.deploy — con variables de entorno" con tests actualizados**

Reemplaza el bloque `describe("proyectos.deploy — con variables de entorno", ...)` con:

```typescript
describe("proyectos.deploy — con variables de entorno", () => {
  const mockProyectoConRepo = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "stopped" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/web-app",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
    servicios: [
      {
        id: "s1",
        nombre: "app",
        estado: "stopped" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoConRepo as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue({
      ...mockProyectoConRepo,
      estado: "running",
    } as never);
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "",
    });
  });

  it("descifra variables y las pasa a ejecutarDeploy", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      {
        id: "v1",
        proyectoId: "p1",
        clave: "DATABASE_URL",
        valorCifrado: "cifrado",
        iv: "iv",
        authTag: "tag",
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ] as never);

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(descifrar).toHaveBeenCalledWith("cifrado", "iv", "tag");
    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: [{ clave: "DATABASE_URL", valor: "valor-descifrado" }],
      }),
    );
  });

  it("llama a ejecutarDeploy con variables vacías si no hay ninguna", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });
    expect(ejecutarDeploy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: [] }),
    );
  });
});
```

- [ ] **Step 4: Añadir tests de listarDeploys al final del fichero**

Añade al final de `src/server/routers/proyectos.test.ts`:

```typescript
describe("proyectos.listarDeploys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve los últimos deploys del proyecto", async () => {
    const deploys = [
      {
        id: "d1",
        rama: "main",
        resultado: "exito",
        output: "ok",
        iniciadoEn: new Date(),
        finalizadoEn: new Date(),
      },
    ];
    vi.mocked(prisma.deploy.findMany).mockResolvedValue(deploys as never);

    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.listarDeploys({
      proyectoId: "p1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].rama).toBe("main");
    expect(result[0].resultado).toBe("exito");
    expect(prisma.deploy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { proyectoId: "p1" },
        orderBy: { iniciadoEn: "desc" },
        take: 20,
      }),
    );
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.listarDeploys({ proyectoId: "p1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 5: Ejecutar los tests para verificar que fallan (red)**

```bash
npx vitest run src/server/routers/proyectos.test.ts
```

Expected: FAIL — `ejecutarDeploy` no existe en el router, `listarDeploys` no existe.

- [ ] **Step 6: Actualizar proyectos.ts — imports**

En `src/server/routers/proyectos.ts`, reemplaza la línea de import de `deployProyecto`:

```typescript
// ELIMINAR:
import { deployProyecto } from "@/lib/docker/deploy";

// AÑADIR:
import { ejecutarDeploy } from "@/lib/docker/deploys";
```

- [ ] **Step 7: Actualizar proyectos.ts — procedure deploy**

Reemplaza el procedure `deploy` completo con:

```typescript
  deploy: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    if (proyecto.estado === "deploying")
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto ya está en proceso de deploy",
      });
    if (!proyecto.repositorioUrl)
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto no tiene repositorio configurado",
      });

    await prisma.proyecto.update({
      where: { id: input.id },
      data: { estado: "deploying" },
    });

    const variablesDB = await prisma.variableEntorno.findMany({
      where: { proyectoId: input.id },
    });
    const variables = variablesDB.map((v) => ({
      clave: v.clave,
      valor: descifrar(v.valorCifrado, v.iv, v.authTag),
    }));

    const { resultado } = await ejecutarDeploy({
      proyectoId: input.id,
      repoUrl: proyecto.repositorioUrl,
      rama: proyecto.rama,
      clienteSlug: proyecto.cliente.slug,
      proyectoNombre: proyecto.nombre,
      servicios: proyecto.servicios.map((s) => s.nombre),
      variables,
    });

    return prisma.proyecto.update({
      where: { id: input.id },
      data: {
        estado: resultado === "exito" ? "running" : "error",
        ...(resultado === "exito"
          ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
          : {}),
      },
    });
  }),
```

- [ ] **Step 8: Añadir procedure listarDeploys al router**

Añade el siguiente procedure antes del cierre del objeto del router (antes del `}`):

```typescript
  listarDeploys: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(async ({ input }) => {
      return prisma.deploy.findMany({
        where: { proyectoId: input.proyectoId },
        orderBy: { iniciadoEn: "desc" },
        take: 20,
        select: {
          id: true,
          rama: true,
          resultado: true,
          output: true,
          iniciadoEn: true,
          finalizadoEn: true,
        },
      });
    }),
```

- [ ] **Step 9: Ejecutar los tests para verificar que pasan (green)**

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
git commit -m "feat: listarDeploys procedure y deploy usa ejecutarDeploy"
```

---

### Task 5: Actualizar webhook route para usar ejecutarDeploy

**Files:**

- Modify: `src/app/api/webhooks/github/route.ts`

No hay tests para esta capa (Infrastructure tier: `src/app/**` excluido de cobertura).

- [ ] **Step 1: Actualizar el import en route.ts**

En `src/app/api/webhooks/github/route.ts`, reemplaza:

```typescript
import { deployProyecto } from "@/lib/docker/deploy";
```

con:

```typescript
import { ejecutarDeploy } from "@/lib/docker/deploys";
```

- [ ] **Step 2: Reemplazar el bloque try/catch de deploy con ejecutarDeploy**

Reemplaza el bloque desde `await prisma.proyecto.update({ where: { id: proyecto.id }, data: { estado: "deploying" } });` hasta `return NextResponse.json({ ok: true, deployed: proyecto.id });` con:

```typescript
await prisma.proyecto.update({
  where: { id: proyecto.id },
  data: { estado: "deploying" },
});

const { resultado } = await ejecutarDeploy({
  proyectoId: proyecto.id,
  repoUrl: proyecto.repositorioUrl!,
  rama: proyecto.rama,
  clienteSlug: proyecto.cliente.slug,
  proyectoNombre: proyecto.nombre,
  servicios: proyecto.servicios.map((s) => s.nombre),
});

await prisma.proyecto.update({
  where: { id: proyecto.id },
  data: {
    estado: resultado === "exito" ? "running" : "error",
    ...(resultado === "exito"
      ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
      : {}),
  },
});

return NextResponse.json({ ok: true, deployed: proyecto.id });
```

- [ ] **Step 3: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 4: Ejecutar todos los tests para confirmar que nada se rompe**

```bash
npm run test:unit
```

Expected: todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/github/route.ts
git commit -m "feat: webhook usa ejecutarDeploy (registra deploy + absorbe error)"
```

---

### Task 6: Crear componente HistorialDeploys (TDD)

**Files:**

- Create: `src/components/dashboard/HistorialDeploys.test.tsx`
- Create: `src/components/dashboard/HistorialDeploys.tsx`

- [ ] **Step 1: Escribir el fichero de tests**

Crea `src/components/dashboard/HistorialDeploys.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistorialDeploys } from "./HistorialDeploys";

const now = new Date();

const deployExito = {
  id: "d1",
  rama: "main",
  resultado: "exito" as const,
  output: "Build completed successfully",
  iniciadoEn: new Date(now.getTime() - 60_000),
  finalizadoEn: new Date(now.getTime() - 58_000),
};

describe("HistorialDeploys", () => {
  it("muestra mensaje vacío cuando no hay deploys", () => {
    render(<HistorialDeploys deploys={[]} />);
    expect(screen.getByText("Sin deploys registrados.")).toBeInTheDocument();
  });

  it("muestra la rama y el resultado del deploy", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("exito")).toBeInTheDocument();
  });

  it("usa text-state-running para resultado exito", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("exito").className).toContain("text-state-running");
  });

  it("usa text-state-error para resultado error", () => {
    const deploys = [{ ...deployExito, resultado: "error" as const }];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("error").className).toContain("text-state-error");
  });

  it("usa text-state-deploying para resultado en_curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("en_curso").className).toContain(
      "text-state-deploying",
    );
  });

  it("muestra la duración en segundos cuando el deploy finalizó", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("2s")).toBeInTheDocument();
  });

  it("muestra guión como duración cuando el deploy está en curso", () => {
    const deploys = [
      { ...deployExito, resultado: "en_curso" as const, finalizadoEn: null },
    ];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renderiza el details/summary para ver el output", () => {
    render(<HistorialDeploys deploys={[deployExito]} />);
    expect(screen.getByText("Ver output")).toBeInTheDocument();
    expect(
      screen.getByText("Build completed successfully"),
    ).toBeInTheDocument();
  });

  it("no renderiza details cuando output es null", () => {
    const deploys = [{ ...deployExito, output: null }];
    render(<HistorialDeploys deploys={deploys} />);
    expect(screen.queryByText("Ver output")).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla (red)**

```bash
npx vitest run src/components/dashboard/HistorialDeploys.test.tsx
```

Expected: FAIL — `Cannot find module './HistorialDeploys'`.

- [ ] **Step 3: Implementar el componente**

Crea `src/components/dashboard/HistorialDeploys.tsx`:

```tsx
import { formatHace } from "@/lib/formatHace";

type Deploy = {
  id: string;
  rama: string;
  resultado: "en_curso" | "exito" | "error";
  output: string | null;
  iniciadoEn: Date;
  finalizadoEn: Date | null;
};

export function HistorialDeploys({ deploys }: { deploys: Deploy[] }) {
  if (deploys.length === 0) {
    return (
      <p className="font-body text-sm text-text-muted">
        Sin deploys registrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {deploys.map((d) => {
        const duracion = d.finalizadoEn
          ? `${Math.round(
              (d.finalizadoEn.getTime() - d.iniciadoEn.getTime()) / 1000,
            )}s`
          : "—";

        const colorResultado =
          d.resultado === "exito"
            ? "text-state-running"
            : d.resultado === "error"
              ? "text-state-error"
              : "text-state-deploying";

        return (
          <div
            key={d.id}
            className="border border-border rounded-[var(--radius-md)] p-4 bg-surface"
          >
            <div className="flex items-center gap-4 flex-wrap">
              <span
                className={`font-body text-xs font-semibold ${colorResultado}`}
              >
                {d.resultado}
              </span>
              <span className="font-body text-xs text-text-muted font-mono">
                {d.rama}
              </span>
              <span className="font-body text-xs text-text-muted">
                {formatHace(d.iniciadoEn)}
              </span>
              <span className="font-body text-xs text-text-muted">
                {duracion}
              </span>
            </div>
            {d.output && (
              <details className="mt-3">
                <summary className="font-body text-xs text-text-muted cursor-pointer hover:text-primary-300">
                  Ver output
                </summary>
                <pre className="mt-2 font-mono text-xs text-text-primary bg-bg border border-border rounded-[var(--radius-sm)] p-3 overflow-x-auto whitespace-pre-wrap">
                  {d.output}
                </pre>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar los tests para verificar que pasan (green)**

```bash
npx vitest run src/components/dashboard/HistorialDeploys.test.tsx
```

Expected: todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/HistorialDeploys.tsx src/components/dashboard/HistorialDeploys.test.tsx
git commit -m "feat: componente HistorialDeploys con badge, duración y output expandible"
```

---

### Task 7: Integrar HistorialDeploys en /proyectos/[id]/page.tsx

**Files:**

- Modify: `src/app/(panel)/proyectos/[id]/page.tsx`

- [ ] **Step 1: Añadir el import de HistorialDeploys en page.tsx**

Al inicio de `src/app/(panel)/proyectos/[id]/page.tsx`, añade el import:

```typescript
import { HistorialDeploys } from "@/components/dashboard/HistorialDeploys";
```

- [ ] **Step 2: Obtener los deploys con listarDeploys y renderizar la sección**

En `DetalleProyectoPage`, justo después de `const variables = await api.variables.listar({ proyectoId: id });`, añade:

```typescript
const deploys = await api.proyectos.listarDeploys({ proyectoId: id });
```

Al final del JSX devuelto, después del bloque `{/* Variables de entorno */}`, añade una nueva sección:

```tsx
{
  /* Historial de deploys */
}
<Section titulo="Historial de deploys">
  <HistorialDeploys deploys={deploys} />
</Section>;
```

- [ ] **Step 3: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 4: Ejecutar todos los tests**

```bash
npm run test:unit
```

Expected: todos los tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/app/(panel)/proyectos/[id]/page.tsx
git commit -m "feat: sección historial de deploys en página de detalle del proyecto"
```

---

## Verificación final

Después de completar todas las tareas:

```bash
npm run test:unit -- --coverage
npm run type-check
npm run build
```

- Cobertura `src/lib/docker/**`: 100% ✓
- Cobertura `src/server/routers/**`: 100% ✓
- Cobertura `src/components/**`: ≥80% ✓
- Build sin errores ✓
