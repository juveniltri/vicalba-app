# Variables de Entorno por Proyecto — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir gestión de variables de entorno cifradas (AES-256-GCM) por proyecto, con página de detalle `/proyectos/[id]` y reestructura de Dashboard y `/proyectos`.

**Architecture:** Nuevo modelo `VariableEntorno` en Prisma con valores cifrados en BD. Router tRPC `variables` para CRUD + reveal. En cada deploy, las variables se descifran en el router y se pasan como `.env.panel` temporal a `docker compose --env-file`. El frontend gestiona las variables desde una página de detalle por proyecto.

**Tech Stack:** Prisma + PostgreSQL, `node:crypto` (AES-256-GCM), tRPC v11, Next.js 15 App Router, Server Actions, Vitest + RTL.

---

## Mapa de ficheros

| Fichero                                            | Estado    | Responsabilidad                                                      |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `prisma/schema.prisma`                             | Modificar | Añadir modelo `VariableEntorno` + relación en `Proyecto`             |
| `src/env.ts`                                       | Modificar | Añadir y validar `ENCRYPTION_KEY`                                    |
| `src/lib/crypto.ts`                                | Crear     | `cifrar` / `descifrar` AES-256-GCM                                   |
| `src/lib/crypto.test.ts`                           | Crear     | Tests 100% cobertura de crypto                                       |
| `src/server/routers/variables.ts`                  | Crear     | Router tRPC: listar/crear/actualizar/eliminar/revelar                |
| `src/server/routers/variables.test.ts`             | Crear     | Tests 100% cobertura del router                                      |
| `src/server/routers/_app.ts`                       | Modificar | Registrar `variablesRouter`                                          |
| `src/server/routers/proyectos.ts`                  | Modificar | Añadir `obtener` + modificar `deploy` para descifrar vars            |
| `src/server/routers/proyectos.test.ts`             | Modificar | Tests para `obtener` + `deploy` con variables                        |
| `src/lib/docker/deploy.ts`                         | Modificar | Parámetro `variables?`, escribir `.env.panel`, cleanup `finally`     |
| `src/lib/docker/deploy.test.ts`                    | Modificar | Mantener tests existentes, añadir test `.env.panel`                  |
| `src/app/(panel)/actions.ts`                       | Modificar | Añadir 4 Server Actions para variables                               |
| `src/components/dashboard/VariablesPanel.tsx`      | Crear     | Componente cliente: tabla vars + revelar + confirmar editar/eliminar |
| `src/components/dashboard/VariablesPanel.test.tsx` | Crear     | Tests 80% cobertura del componente                                   |
| `src/app/(panel)/proyectos/[id]/page.tsx`          | Crear     | Página de detalle: cabecera + info + VariablesPanel                  |
| `src/app/(panel)/proyectos/page.tsx`               | Modificar | Reemplazar tabla por ClientSection + ProjectCard                     |
| `src/components/dashboard/ProjectCard.tsx`         | Modificar | Añadir enlace "Ver detalle →"                                        |
| `src/app/(panel)/page.tsx`                         | Modificar | Simplificar dashboard: ResumenStats + lista compacta + placeholder   |

---

## Task 1: Schema Prisma — modelo VariableEntorno

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Paso 1: Añadir modelo y relación al schema**

Añadir al final de `prisma/schema.prisma`, antes del cierre del fichero:

```prisma
model VariableEntorno {
  id            String   @id @default(cuid())
  proyecto      Proyecto @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  proyectoId    String
  clave         String
  valorCifrado  String
  iv            String
  authTag       String
  creadoEn      DateTime @default(now())
  actualizadoEn DateTime @updatedAt

  @@unique([proyectoId, clave])
}
```

En el modelo `Proyecto`, añadir la relación inversa después de `servicios Servicio[]`:

```prisma
  variables     VariableEntorno[]
```

- [ ] **Paso 2: Generar y aplicar migración**

```bash
npx prisma migrate dev --name add_variables_entorno
```

Salida esperada: `Your database is now in sync with your schema.`

- [ ] **Paso 3: Verificar que el cliente Prisma se regeneró**

```bash
npx prisma generate
```

Salida esperada: sin errores. El tipo `VariableEntorno` debe estar disponible en `@prisma/client`.

- [ ] **Paso 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add VariableEntorno schema model"
```

---

## Task 2: ENCRYPTION_KEY en env.ts

**Files:**

- Modify: `src/env.ts`

- [ ] **Paso 1: Añadir validación de ENCRYPTION_KEY**

En `src/env.ts`, dentro de `serverSchema`, añadir después de `GITHUB_WEBHOOK_SECRET`:

```ts
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      "ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales (32 bytes)",
    ),
```

- [ ] **Paso 2: Añadir ENCRYPTION_KEY a .env.local para desarrollo**

Generar una clave de desarrollo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Añadir la salida a `.env.local`:

```
ENCRYPTION_KEY=<salida del comando anterior>
```

- [ ] **Paso 3: Verificar que la app arranca sin errores de validación**

```bash
npm run type-check
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/env.ts
git commit -m "feat: add ENCRYPTION_KEY env var validation"
```

---

## Task 3: src/lib/crypto.ts — cifrado AES-256-GCM (TDD)

**Files:**

- Create: `src/lib/crypto.ts`
- Create: `src/lib/crypto.test.ts`

- [ ] **Paso 1: Escribir los tests en fallo**

Crear `src/lib/crypto.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { ENCRYPTION_KEY: "a".repeat(64) },
}));

import { cifrar, descifrar } from "./crypto";

describe("cifrar + descifrar", () => {
  it("roundtrip: descifrar(cifrar(valor)) === valor", () => {
    const { valorCifrado, iv, authTag } = cifrar("mi-secret-123");
    expect(descifrar(valorCifrado, iv, authTag)).toBe("mi-secret-123");
  });

  it("roundtrip con valor vacío", () => {
    const { valorCifrado, iv, authTag } = cifrar("");
    expect(descifrar(valorCifrado, iv, authTag)).toBe("");
  });

  it("roundtrip con caracteres especiales y unicode", () => {
    const valor = "p@ssw0rd!#$%^&*()_+áéíóú";
    const { valorCifrado, iv, authTag } = cifrar(valor);
    expect(descifrar(valorCifrado, iv, authTag)).toBe(valor);
  });

  it("genera IV distinto en cada llamada a cifrar", () => {
    const r1 = cifrar("mismo-valor");
    const r2 = cifrar("mismo-valor");
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("genera valorCifrado distinto en cada llamada aunque el valor sea igual", () => {
    const r1 = cifrar("mismo-valor");
    const r2 = cifrar("mismo-valor");
    expect(r1.valorCifrado).not.toBe(r2.valorCifrado);
  });

  it("lanza error si el authTag es inválido (integridad comprometida)", () => {
    const { valorCifrado, iv } = cifrar("secreto");
    const authTagFalso = "b".repeat(32);
    expect(() => descifrar(valorCifrado, iv, authTagFalso)).toThrow();
  });

  it("lanza error si el IV es incorrecto", () => {
    const { valorCifrado, authTag } = cifrar("secreto");
    const ivFalso = "c".repeat(24);
    expect(() => descifrar(valorCifrado, ivFalso, authTag)).toThrow();
  });
});
```

- [ ] **Paso 2: Ejecutar tests para verificar que fallan**

```bash
npm run test:unit -- crypto
```

Salida esperada: FAIL — `Cannot find module './crypto'`

- [ ] **Paso 3: Implementar src/lib/crypto.ts**

Crear `src/lib/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function cifrar(valor: string): {
  valorCifrado: string;
  iv: string;
  authTag: string;
} {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(valor, "utf8"),
    cipher.final(),
  ]);
  return {
    valorCifrado: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function descifrar(
  valorCifrado: string,
  iv: string,
  authTag: string,
): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(valorCifrado, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```

- [ ] **Paso 4: Ejecutar tests para verificar que pasan**

```bash
npm run test:unit -- crypto
```

Salida esperada: 7 tests PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/crypto.ts src/lib/crypto.test.ts
git commit -m "feat: AES-256-GCM encrypt/decrypt lib"
```

---

## Task 4: Router tRPC variables (TDD)

**Files:**

- Create: `src/server/routers/variables.ts`
- Create: `src/server/routers/variables.test.ts`

- [ ] **Paso 1: Escribir los tests en fallo**

Crear `src/server/routers/variables.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    variableEntorno: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/crypto", () => ({
  cifrar: vi.fn().mockReturnValue({
    valorCifrado: "cifrado-base64",
    iv: "iv-hex",
    authTag: "tag-hex",
  }),
  descifrar: vi.fn().mockReturnValue("valor-descifrado"),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { cifrar, descifrar } from "@/lib/crypto";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockVariable = {
  id: "v1",
  proyectoId: "p1",
  clave: "DATABASE_URL",
  valorCifrado: "cifrado-base64",
  iv: "iv-hex",
  authTag: "tag-hex",
  creadoEn: new Date(),
  actualizadoEn: new Date(),
};

describe("variables.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve solo id, clave y creadoEn — sin valores", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([
      mockVariable,
    ] as never);
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.listar({
      proyectoId: "p1",
    });
    expect(result).toHaveLength(1);
    expect(result[0].clave).toBe("DATABASE_URL");
    expect(result[0]).not.toHaveProperty("valorCifrado");
    expect(result[0]).not.toHaveProperty("iv");
  });

  it("lanza UNAUTHORIZED si no hay sesión", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.listar({ proyectoId: "p1" }),
    ).rejects.toThrow();
  });
});

describe("variables.crear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("cifra el valor y guarda en BD", async () => {
    vi.mocked(prisma.variableEntorno.create).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.crear({
      proyectoId: "p1",
      clave: "DATABASE_URL",
      valor: "postgres://...",
    });
    expect(cifrar).toHaveBeenCalledWith("postgres://...");
    expect(prisma.variableEntorno.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clave: "DATABASE_URL",
          valorCifrado: "cifrado-base64",
          iv: "iv-hex",
          authTag: "tag-hex",
        }),
      }),
    );
  });

  it("rechaza clave vacía", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "",
        valor: "x",
      }),
    ).rejects.toThrow();
  });

  it("rechaza clave con caracteres inválidos (espacios)", async () => {
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "MI CLAVE",
        valor: "x",
      }),
    ).rejects.toThrow();
  });

  it("lanza CONFLICT si la clave ya existe en el proyecto", async () => {
    vi.mocked(prisma.variableEntorno.create).mockRejectedValue({
      code: "P2002",
    });
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.crear({
        proyectoId: "p1",
        clave: "DATABASE_URL",
        valor: "x",
      }),
    ).rejects.toThrow("ya existe");
  });
});

describe("variables.actualizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("genera nuevo IV y re-cifra el valor", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.update).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.actualizar({
      id: "v1",
      valor: "nuevo-valor",
    });
    expect(cifrar).toHaveBeenCalledWith("nuevo-valor");
    expect(prisma.variableEntorno.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v1" },
        data: expect.objectContaining({ valorCifrado: "cifrado-base64" }),
      }),
    );
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.actualizar({ id: "no-existe", valor: "x" }),
    ).rejects.toThrow("no encontrada");
  });
});

describe("variables.eliminar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("elimina la variable existente", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    vi.mocked(prisma.variableEntorno.delete).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    await createCaller(ctx).variables.eliminar({ id: "v1" });
    expect(prisma.variableEntorno.delete).toHaveBeenCalledWith({
      where: { id: "v1" },
    });
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.eliminar({ id: "no-existe" }),
    ).rejects.toThrow("no encontrada");
  });
});

describe("variables.revelar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("descifra y devuelve el valor en claro", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(
      mockVariable as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).variables.revelar({ id: "v1" });
    expect(descifrar).toHaveBeenCalledWith(
      "cifrado-base64",
      "iv-hex",
      "tag-hex",
    );
    expect(result.valor).toBe("valor-descifrado");
  });

  it("lanza NOT_FOUND si la variable no existe", async () => {
    vi.mocked(prisma.variableEntorno.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).variables.revelar({ id: "no-existe" }),
    ).rejects.toThrow("no encontrada");
  });
});
```

- [ ] **Paso 2: Ejecutar tests para verificar que fallan**

```bash
npm run test:unit -- variables.test
```

Salida esperada: FAIL — `Cannot find module './variables'` o similar.

- [ ] **Paso 3: Implementar src/server/routers/variables.ts**

Crear `src/server/routers/variables.ts`:

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cifrar, descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const idInput = z.object({ id: z.string() });

const claveSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    "La clave solo puede contener mayúsculas, números y guiones bajos (ej: DATABASE_URL)",
  );

async function findVariableOrThrow(id: string) {
  const variable = await prisma.variableEntorno.findUnique({ where: { id } });
  if (!variable)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Variable no encontrada",
    });
  return variable;
}

export const variablesRouter = router({
  listar: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(async ({ input }) => {
      return prisma.variableEntorno.findMany({
        where: { proyectoId: input.proyectoId },
        select: { id: true, clave: true, creadoEn: true },
        orderBy: { clave: "asc" },
      });
    }),

  crear: protectedProcedure
    .input(
      z.object({
        proyectoId: z.string(),
        clave: claveSchema,
        valor: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const { valorCifrado, iv, authTag } = cifrar(input.valor);
      try {
        return await prisma.variableEntorno.create({
          data: {
            proyectoId: input.proyectoId,
            clave: input.clave,
            valorCifrado,
            iv,
            authTag,
          },
          select: { id: true, clave: true, creadoEn: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "La clave ya existe en este proyecto",
          });
        throw err;
      }
    }),

  actualizar: protectedProcedure
    .input(z.object({ id: z.string(), valor: z.string() }))
    .mutation(async ({ input }) => {
      await findVariableOrThrow(input.id);
      const { valorCifrado, iv, authTag } = cifrar(input.valor);
      return prisma.variableEntorno.update({
        where: { id: input.id },
        data: { valorCifrado, iv, authTag },
        select: { id: true, clave: true, creadoEn: true },
      });
    }),

  eliminar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    await findVariableOrThrow(input.id);
    await prisma.variableEntorno.delete({ where: { id: input.id } });
  }),

  revelar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const variable = await findVariableOrThrow(input.id);
    return {
      valor: descifrar(variable.valorCifrado, variable.iv, variable.authTag),
    };
  }),
});
```

- [ ] **Paso 4: Ejecutar tests para verificar que pasan**

```bash
npm run test:unit -- variables.test
```

Salida esperada: todos los tests PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/server/routers/variables.ts src/server/routers/variables.test.ts
git commit -m "feat: variables tRPC router — CRUD + revelar con AES-256-GCM"
```

---

## Task 5: Registrar router + añadir proyectos.obtener

**Files:**

- Modify: `src/server/routers/_app.ts`
- Modify: `src/server/routers/proyectos.ts`
- Modify: `src/server/routers/proyectos.test.ts`

- [ ] **Paso 1: Registrar variablesRouter en \_app.ts**

Reemplazar el contenido completo de `src/server/routers/_app.ts`:

```ts
import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { proyectosRouter } from "./proyectos";
import { variablesRouter } from "./variables";

export const appRouter = router({
  clientes: clientesRouter,
  proyectos: proyectosRouter,
  variables: variablesRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Paso 2: Escribir tests para proyectos.obtener (en fallo)**

En `src/server/routers/proyectos.test.ts`, al final del fichero añadir:

```ts
describe("proyectos.obtener", () => {
  const mockProyecto = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "running" as const,
    dominio: "app.cliente-uno.com",
    repositorioUrl: "https://github.com/org/web-app",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ultimoDeployRama: "main",
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
        nombre: "nginx",
        estado: "running" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve el proyecto con cliente y servicios", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.nombre).toBe("web-app");
    expect(result.clienteNombre).toBe("Cliente Uno");
    expect(result.clienteSlug).toBe("cliente-uno");
    expect(result.servicios[0].nombre).toBe("nginx");
  });

  it("mapea ultimoDeployEn a objeto ultimoDeploy", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyecto as never,
    );
    const ctx = await createContext();
    const result = await createCaller(ctx).proyectos.obtener({ id: "p1" });
    expect(result.ultimoDeploy).not.toBeNull();
    expect(result.ultimoDeploy?.rama).toBe("main");
  });

  it("lanza NOT_FOUND si el proyecto no existe", async () => {
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(null);
    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.obtener({ id: "no-existe" }),
    ).rejects.toThrow("no encontrado");
  });
});
```

- [ ] **Paso 3: Ejecutar tests para verificar que fallan**

```bash
npm run test:unit -- proyectos.test
```

Salida esperada: los nuevos tests de `obtener` FAIL.

- [ ] **Paso 4: Implementar proyectos.obtener en proyectos.ts**

En `src/server/routers/proyectos.ts`, añadir al objeto del router (antes de `listar`):

```ts
  obtener: protectedProcedure.input(idInput).query(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      clienteSlug: proyecto.cliente.slug,
      clienteNombre: proyecto.cliente.nombre,
      estado: proyecto.estado,
      dominio: proyecto.dominio,
      repositorioUrl: proyecto.repositorioUrl,
      rama: proyecto.rama,
      autoDeployHabilitado: proyecto.autoDeployHabilitado,
      servicios: proyecto.servicios.map((s) => ({
        nombre: s.nombre,
        estado: s.estado,
      })),
      ultimoDeploy:
        proyecto.ultimoDeployEn && proyecto.ultimoDeployRama
          ? {
              hace: formatHace(proyecto.ultimoDeployEn),
              rama: proyecto.ultimoDeployRama,
            }
          : null,
    };
  }),
```

- [ ] **Paso 5: Ejecutar todos los tests**

```bash
npm run test:unit -- proyectos.test
```

Salida esperada: todos los tests PASS incluyendo los nuevos de `obtener`.

- [ ] **Paso 6: Commit**

```bash
git add src/server/routers/_app.ts src/server/routers/proyectos.ts src/server/routers/proyectos.test.ts
git commit -m "feat: register variablesRouter, add proyectos.obtener"
```

---

## Task 6: Modificar deployProyecto — inyección de variables

**Files:**

- Modify: `src/lib/docker/deploy.ts`
- Modify: `src/lib/docker/deploy.test.ts`

- [ ] **Paso 1: Añadir test para el comportamiento con variables**

En `src/lib/docker/deploy.test.ts`, al mock de `node:fs/promises` añadir `unlink`:

```ts
const { mockExecFile, mockWriteFile, mockMkdir, mockUnlink } = vi.hoisted(
  () => ({
    mockExecFile: vi.fn(),
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockUnlink: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));
vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  unlink: mockUnlink,
}));
```

Al final del fichero añadir:

```ts
describe("deployProyecto con variables de entorno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        cb: (err: null, stdout: string, stderr: string) => void,
      ) => cb(null, "", ""),
    );
  });

  it("escribe .env.panel y lo pasa como --env-file cuando hay variables", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [
        { clave: "DATABASE_URL", valor: "postgres://localhost/db" },
        { clave: "JWT_SECRET", valor: "supersecret" },
      ],
    });

    const envFilePath = "/var/vicalba/repos/acme/web-app/.env.panel";
    expect(mockWriteFile).toHaveBeenCalledWith(
      envFilePath,
      "DATABASE_URL=postgres://localhost/db\nJWT_SECRET=supersecret",
      "utf-8",
    );

    const dockerCall = vi
      .mocked(mockExecFile)
      .mock.calls.find((c) => c[0] === "docker");
    expect(dockerCall?.[1]).toContain("--env-file");
    expect(dockerCall?.[1]).toContain(envFilePath);
  });

  it("elimina .env.panel en el bloque finally tras deploy exitoso", async () => {
    await deployProyecto({
      ...baseParams,
      variables: [{ clave: "X", valor: "y" }],
    });
    expect(mockUnlink).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env.panel",
    );
  });

  it("elimina .env.panel aunque el deploy falle", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (args[0] === "compose") return cb(new Error("docker error"), "", "");
        return cb(null, "", "");
      },
    );
    await expect(
      deployProyecto({
        ...baseParams,
        variables: [{ clave: "X", valor: "y" }],
      }),
    ).rejects.toThrow();
    expect(mockUnlink).toHaveBeenCalledWith(
      "/var/vicalba/repos/acme/web-app/.env.panel",
    );
  });

  it("no escribe .env.panel cuando no hay variables", async () => {
    await deployProyecto(baseParams);
    const writeFileCalls = vi.mocked(mockWriteFile).mock.calls;
    const envFileCall = writeFileCalls.find((c) =>
      String(c[0]).endsWith(".env.panel"),
    );
    expect(envFileCall).toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 2: Verificar que los nuevos tests fallan**

```bash
npm run test:unit -- deploy.test
```

Salida esperada: los tests nuevos FAIL.

- [ ] **Paso 3: Implementar la modificación en deploy.ts**

Reemplazar el contenido completo de `src/lib/docker/deploy.ts`:

```ts
import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { env } from "@/env";

const execFileAsync = promisify(execFile);

async function ensureRepo(repoUrl: string, repoDir: string): Promise<void> {
  try {
    await execFileAsync("git", [
      "-C",
      repoDir,
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    await execFileAsync("git", ["-C", repoDir, "pull"]);
  } catch {
    await execFileAsync("git", ["clone", repoUrl, repoDir]);
  }
}

function generarComposeOverride(
  clienteSlug: string,
  servicios: string[],
): string {
  const nombreRed = `cliente-${clienteSlug}-network`;
  const serviciosYaml = servicios
    .map((s) => `  ${s}:\n    networks:\n      - default\n      - cliente-net`)
    .join("\n");

  return [
    "networks:",
    "  cliente-net:",
    `    name: ${nombreRed}`,
    "    external: true",
    "services:",
    serviciosYaml,
  ].join("\n");
}

export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<void> {
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

  try {
    await execFileAsync("docker", composeArgs);
  } finally {
    if (hasVars) {
      await unlink(envFilePath).catch(() => {});
    }
  }
}
```

- [ ] **Paso 4: Ejecutar todos los tests de deploy**

```bash
npm run test:unit -- deploy.test
```

Salida esperada: todos los tests PASS (existentes y nuevos).

- [ ] **Paso 5: Commit**

```bash
git add src/lib/docker/deploy.ts src/lib/docker/deploy.test.ts
git commit -m "feat: deployProyecto acepta variables, genera .env.panel temporal"
```

---

## Task 7: Modificar proyectos.deploy — descifrar y pasar variables

**Files:**

- Modify: `src/server/routers/proyectos.ts`
- Modify: `src/server/routers/proyectos.test.ts`

- [ ] **Paso 1: Añadir mock de variableEntorno y crypto al test existente**

En `src/server/routers/proyectos.test.ts`, añadir en los mocks iniciales (antes de los imports):

```ts
vi.mock("@/lib/crypto", () => ({
  descifrar: vi.fn().mockReturnValue("valor-descifrado"),
}));
```

En el mock de `@/lib/prisma`, añadir `variableEntorno` al objeto prisma:

```ts
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
  },
}));
```

Añadir import al bloque de imports existente:

```ts
import { descifrar } from "@/lib/crypto";
```

- [ ] **Paso 2: Añadir tests para deploy con variables**

En `proyectos.test.ts`, al final del bloque `describe("proyectos.deploy", ...)` (o añadir uno nuevo al final del fichero):

```ts
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
  });

  it("descifra variables y las pasa a deployProyecto", async () => {
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
    expect(deployProyecto).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: [{ clave: "DATABASE_URL", valor: "valor-descifrado" }],
      }),
    );
  });

  it("llama a deployProyecto con variables vacías si no hay ninguna", async () => {
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });
    expect(deployProyecto).toHaveBeenCalledWith(
      expect.objectContaining({ variables: [] }),
    );
  });
});
```

- [ ] **Paso 3: Verificar que los nuevos tests fallan**

```bash
npm run test:unit -- proyectos.test
```

Salida esperada: los tests nuevos FAIL.

- [ ] **Paso 4: Modificar proyectos.deploy en proyectos.ts**

En `src/server/routers/proyectos.ts`, añadir el import de `descifrar`:

```ts
import { descifrar } from "@/lib/crypto";
```

Añadir también el import de `prisma` si no está ya (está). En el procedimiento `deploy`, reemplazar el bloque `try` para incluir la carga y descifrado de variables:

```ts
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

    try {
      const variablesDB = await prisma.variableEntorno.findMany({
        where: { proyectoId: input.id },
      });
      const variables = variablesDB.map((v) => ({
        clave: v.clave,
        valor: descifrar(v.valorCifrado, v.iv, v.authTag),
      }));

      await deployProyecto({
        repoUrl: proyecto.repositorioUrl,
        rama: proyecto.rama,
        clienteSlug: proyecto.cliente.slug,
        proyectoNombre: proyecto.nombre,
        servicios: proyecto.servicios.map((s) => s.nombre),
        variables,
      });
    } catch (err) {
      await prisma.proyecto.update({
        where: { id: input.id },
        data: { estado: "error" },
      });
      throw err;
    }

    return prisma.proyecto.update({
      where: { id: input.id },
      data: {
        estado: "running",
        ultimoDeployEn: new Date(),
        ultimoDeployRama: proyecto.rama,
      },
    });
  }),
```

- [ ] **Paso 5: Ejecutar todos los tests**

```bash
npm run test:unit -- proyectos.test
```

Salida esperada: todos los tests PASS.

- [ ] **Paso 6: Commit**

```bash
git add src/server/routers/proyectos.ts src/server/routers/proyectos.test.ts
git commit -m "feat: proyectos.deploy descifra variables antes del deploy"
```

---

## Task 8: Server Actions para variables

**Files:**

- Modify: `src/app/(panel)/actions.ts`

- [ ] **Paso 1: Añadir las 4 actions al final de actions.ts**

```ts
export async function crearVariableAction(
  proyectoId: string,
  clave: string,
  valor: string,
) {
  try {
    const api = await createServerCaller();
    await api.variables.crear({ proyectoId, clave, valor });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al crear variable",
    };
  }
}

export async function actualizarVariableAction(id: string, valor: string) {
  try {
    const api = await createServerCaller();
    await api.variables.actualizar({ id, valor });
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Error al actualizar variable",
    };
  }
}

export async function eliminarVariableAction(id: string) {
  try {
    const api = await createServerCaller();
    await api.variables.eliminar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al eliminar variable",
    };
  }
}

export async function revelarVariableAction(
  id: string,
): Promise<{ valor: string } | { error: string }> {
  try {
    const api = await createServerCaller();
    return await api.variables.revelar({ id });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al revelar variable",
    };
  }
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
npm run type-check
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add src/app/(panel)/actions.ts
git commit -m "feat: server actions para CRUD de variables de entorno"
```

---

## Task 9: Componente VariablesPanel (TDD)

**Files:**

- Create: `src/components/dashboard/VariablesPanel.tsx`
- Create: `src/components/dashboard/VariablesPanel.test.tsx`

- [ ] **Paso 1: Escribir tests en fallo**

Crear `src/components/dashboard/VariablesPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VariablesPanel } from "./VariablesPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock("@/app/(panel)/actions", () => ({
  crearVariableAction: vi.fn().mockResolvedValue(undefined),
  actualizarVariableAction: vi.fn().mockResolvedValue(undefined),
  eliminarVariableAction: vi.fn().mockResolvedValue(undefined),
  revelarVariableAction: vi
    .fn()
    .mockResolvedValue({ valor: "postgres://secret" }),
}));

import {
  crearVariableAction,
  actualizarVariableAction,
  eliminarVariableAction,
  revelarVariableAction,
} from "@/app/(panel)/actions";

const variablesBase = [
  { id: "v1", clave: "DATABASE_URL", creadoEn: new Date() },
  { id: "v2", clave: "JWT_SECRET", creadoEn: new Date() },
];

describe("VariablesPanel — renderizado", () => {
  it("muestra las claves de las variables", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    expect(screen.getByText("DATABASE_URL")).toBeInTheDocument();
    expect(screen.getByText("JWT_SECRET")).toBeInTheDocument();
  });

  it("muestra los valores enmascarados", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const masks = screen.getAllByText("••••••••");
    expect(masks).toHaveLength(2);
  });

  it("muestra mensaje vacío si no hay variables", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    expect(screen.getByText(/sin variables/i)).toBeInTheDocument();
  });
});

describe("VariablesPanel — revelar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("llama a revelarVariableAction y muestra el valor en claro", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const revelarBtns = screen.getAllByRole("button", { name: /revelar/i });
    fireEvent.click(revelarBtns[0]);
    await waitFor(() => {
      expect(revelarVariableAction).toHaveBeenCalledWith("v1");
      expect(screen.getByText("postgres://secret")).toBeInTheDocument();
    });
  });
});

describe("VariablesPanel — eliminar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra confirmación antes de eliminar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    expect(
      screen.getByRole("button", { name: /confirmar/i }),
    ).toBeInTheDocument();
    expect(eliminarVariableAction).not.toHaveBeenCalled();
  });

  it("cancela la eliminación al pulsar cancelar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(eliminarVariableAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /confirmar/i }),
    ).not.toBeInTheDocument();
  });

  it("llama a eliminarVariableAction al confirmar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const eliminarBtns = screen.getAllByRole("button", { name: /eliminar/i });
    fireEvent.click(eliminarBtns[0]);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => {
      expect(eliminarVariableAction).toHaveBeenCalledWith("v1");
    });
  });
});

describe("VariablesPanel — editar con confirmación", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra input de edición al pulsar editar", () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const editarBtns = screen.getAllByRole("button", { name: /editar/i });
    fireEvent.click(editarBtns[0]);
    expect(
      screen.getByRole("textbox", { name: /nuevo valor/i }),
    ).toBeInTheDocument();
  });

  it("llama a actualizarVariableAction al guardar", async () => {
    render(
      <VariablesPanel proyectoId="p1" variablesIniciales={variablesBase} />,
    );
    const editarBtns = screen.getAllByRole("button", { name: /editar/i });
    fireEvent.click(editarBtns[0]);
    const input = screen.getByRole("textbox", { name: /nuevo valor/i });
    fireEvent.change(input, { target: { value: "nuevo-valor" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(actualizarVariableAction).toHaveBeenCalledWith(
        "v1",
        "nuevo-valor",
      );
    });
  });
});

describe("VariablesPanel — añadir variable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra formulario al pulsar Añadir variable", () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir variable/i }));
    expect(screen.getByRole("textbox", { name: /clave/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /valor/i })).toBeInTheDocument();
  });

  it("llama a crearVariableAction con los datos del formulario", async () => {
    render(<VariablesPanel proyectoId="p1" variablesIniciales={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /añadir variable/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /clave/i }), {
      target: { value: "API_KEY" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /valor/i }), {
      target: { value: "mi-api-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      expect(crearVariableAction).toHaveBeenCalledWith(
        "p1",
        "API_KEY",
        "mi-api-key",
      );
    });
  });
});
```

- [ ] **Paso 2: Ejecutar tests para verificar que fallan**

```bash
npm run test:unit -- VariablesPanel
```

Salida esperada: FAIL — `Cannot find module './VariablesPanel'`

- [ ] **Paso 3: Implementar VariablesPanel.tsx**

Crear `src/components/dashboard/VariablesPanel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualizarVariableAction,
  crearVariableAction,
  eliminarVariableAction,
  revelarVariableAction,
} from "@/app/(panel)/actions";

type VariableResumen = { id: string; clave: string; creadoEn: Date };

export function VariablesPanel({
  proyectoId,
  variablesIniciales,
}: {
  proyectoId: string;
  variablesIniciales: VariableResumen[];
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClave, setNewClave] = useState("");
  const [newValor, setNewValor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  async function handleRevelar(id: string) {
    const result = await revelarVariableAction(id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setRevealed((prev) => ({ ...prev, [id]: result.valor }));
    if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
    timersRef.current[id] = setTimeout(() => {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 30_000);
  }

  async function handleGuardarEdicion(id: string) {
    setLoading(true);
    setError(null);
    const result = await actualizarVariableAction(id, editValue);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setEditingId(null);
    setEditValue("");
    router.refresh();
    setLoading(false);
  }

  async function handleConfirmarEliminar(id: string) {
    setLoading(true);
    setError(null);
    const result = await eliminarVariableAction(id);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setConfirmDeleteId(null);
    router.refresh();
    setLoading(false);
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await crearVariableAction(proyectoId, newClave, newValor);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setNewClave("");
    setNewValor("");
    setShowAddForm(false);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="font-body text-xs text-state-error">
          {error}
        </p>
      )}

      {variablesIniciales.length === 0 && !showAddForm ? (
        <p className="font-body text-xs text-text-muted">
          Sin variables configuradas.
        </p>
      ) : (
        <div className="border border-border rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <Th>Clave</Th>
                <Th>Valor</Th>
                <Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {variablesIniciales.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors duration-[var(--duration-fast)]"
                >
                  <td className="px-4 py-3 font-body text-sm text-text-primary">
                    {v.clave}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <input
                        aria-label="Nuevo valor"
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 w-full"
                      />
                    ) : (
                      <span className="font-body text-xs text-text-muted">
                        {revealed[v.id] ?? "••••••••"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === v.id ? (
                      <div className="flex items-center gap-2">
                        <Btn
                          onClick={() => handleGuardarEdicion(v.id)}
                          disabled={loading}
                          aria-label="Guardar"
                        >
                          Guardar
                        </Btn>
                        <Btn
                          onClick={() => {
                            setEditingId(null);
                            setEditValue("");
                          }}
                          aria-label="Cancelar"
                        >
                          Cancelar
                        </Btn>
                      </div>
                    ) : confirmDeleteId === v.id ? (
                      <div className="flex items-center gap-2">
                        <span className="font-body text-xs text-state-error">
                          ¿Eliminar?
                        </span>
                        <Btn
                          onClick={() => handleConfirmarEliminar(v.id)}
                          disabled={loading}
                          aria-label="Confirmar"
                        >
                          Confirmar
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label="Cancelar"
                        >
                          Cancelar
                        </Btn>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Btn
                          onClick={() => handleRevelar(v.id)}
                          aria-label="Revelar"
                        >
                          Revelar
                        </Btn>
                        <Btn
                          onClick={() => {
                            setEditingId(v.id);
                            setEditValue("");
                          }}
                          aria-label="Editar"
                        >
                          Editar
                        </Btn>
                        <Btn
                          onClick={() => setConfirmDeleteId(v.id)}
                          aria-label="Eliminar"
                        >
                          Eliminar
                        </Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddForm ? (
        <form onSubmit={handleCrear} className="flex flex-col gap-2 pt-1">
          <div className="flex gap-2">
            <input
              aria-label="Clave"
              type="text"
              placeholder="NOMBRE_VARIABLE"
              value={newClave}
              onChange={(e) => setNewClave(e.target.value.toUpperCase())}
              required
              className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 flex-1"
            />
            <input
              aria-label="Valor"
              type="text"
              placeholder="valor del secret"
              value={newValor}
              onChange={(e) => setNewValor(e.target.value)}
              required
              className="font-body text-xs bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 text-text-primary focus:outline-none focus:border-primary-300 flex-1"
            />
          </div>
          <div className="flex gap-2">
            <Btn primary disabled={loading} aria-label="Guardar">
              {loading ? "…" : "Guardar"}
            </Btn>
            <Btn
              onClick={() => {
                setShowAddForm(false);
                setNewClave("");
                setNewValor("");
              }}
              aria-label="Cancelar"
            >
              Cancelar
            </Btn>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="self-start font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 transition-colors duration-[var(--duration-fast)]"
        >
          + Añadir variable
        </button>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-body text-xs text-text-muted uppercase tracking-wider">
      {children}
    </th>
  );
}

function Btn({
  children,
  onClick,
  disabled = false,
  primary = false,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`font-body text-xs px-2 py-1 rounded-[var(--radius-sm)] border transition-colors duration-[var(--duration-fast)] disabled:opacity-40 ${
        primary
          ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-700"
          : "border-border text-text-muted hover:border-primary-300"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Paso 4: Ejecutar tests para verificar que pasan**

```bash
npm run test:unit -- VariablesPanel
```

Salida esperada: todos los tests PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/components/dashboard/VariablesPanel.tsx src/components/dashboard/VariablesPanel.test.tsx
git commit -m "feat: VariablesPanel — CRUD variables con reveal y confirmaciones"
```

---

## Task 10: Página de detalle /proyectos/[id]

**Files:**

- Create: `src/app/(panel)/proyectos/[id]/page.tsx`

- [ ] **Paso 1: Crear el directorio y la página**

Crear `src/app/(panel)/proyectos/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { VariablesPanel } from "@/components/dashboard/VariablesPanel";
import {
  deployProyectoAction,
  detenerAction,
  iniciarAction,
  restartAction,
  toggleAutoDeployAction,
} from "@/app/(panel)/actions";

export default async function DetalleProyectoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const api = await createServerCaller();

  let proyecto: Awaited<ReturnType<typeof api.proyectos.obtener>>;
  try {
    proyecto = await api.proyectos.obtener({ id });
  } catch {
    notFound();
  }

  const variables = await api.variables.listar({ proyectoId: id });

  const isDeploying = proyecto.estado === "deploying";
  const canAct = !isDeploying;

  return (
    <div className="max-w-3xl flex flex-col gap-8">
      {/* Cabecera */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-body text-xs text-text-muted bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-0.5">
            {proyecto.clienteNombre}
          </span>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            {proyecto.nombre}
          </h1>
          <StatusBadge estado={proyecto.estado} />
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={iniciarAction.bind(null, id)}>
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "running"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Iniciar
            </button>
          </form>
          <form action={detenerAction.bind(null, id)}>
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "stopped"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Detener
            </button>
          </form>
          <form action={restartAction.bind(null, id)}>
            <button
              type="submit"
              disabled={!canAct || proyecto.estado === "stopped"}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:border-primary-300 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              Reiniciar
            </button>
          </form>
          <form action={deployProyectoAction.bind(null, id)}>
            <button
              type="submit"
              disabled={isDeploying}
              className="font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] bg-primary-500 border border-primary-500 text-white hover:bg-primary-700 disabled:opacity-40 transition-colors duration-[var(--duration-fast)]"
            >
              {isDeploying ? "Deploying…" : "Deploy"}
            </button>
          </form>
          <form action={toggleAutoDeployAction.bind(null, id)}>
            <button
              type="submit"
              className={`font-body text-xs px-3 py-1.5 rounded-[var(--radius-sm)] border transition-colors duration-[var(--duration-fast)] ${
                proyecto.autoDeployHabilitado
                  ? "border-state-running text-state-running"
                  : "border-border text-text-muted hover:border-primary-300"
              }`}
            >
              Auto-deploy {proyecto.autoDeployHabilitado ? "ON" : "OFF"}
            </button>
          </form>
        </div>
      </div>

      {/* Información */}
      <Section titulo="Información">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            label="Dominio"
            valor={proyecto.dominio ?? "—"}
            mono={!!proyecto.dominio}
          />
          <Campo
            label="Repositorio"
            valor={proyecto.repositorioUrl ?? "—"}
            mono={!!proyecto.repositorioUrl}
          />
          <Campo label="Rama de deploy" valor={proyecto.rama} mono />
          <div className="flex flex-col gap-1">
            <span className="font-body text-xs text-text-muted">Servicios</span>
            <div className="flex flex-wrap gap-2">
              {proyecto.servicios.map((s) => (
                <div key={s.nombre} className="flex items-center gap-1.5">
                  <StatusBadge estado={s.estado} />
                  <span className="font-body text-xs text-text-primary">
                    {s.nombre}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {proyecto.ultimoDeploy && (
            <Campo
              label="Último deploy"
              valor={`${proyecto.ultimoDeploy.hace} · ${proyecto.ultimoDeploy.rama}`}
            />
          )}
        </div>
      </Section>

      {/* Variables de entorno */}
      <Section titulo="Variables de entorno">
        <VariablesPanel proyectoId={id} variablesIniciales={variables} />
      </Section>
    </div>
  );
}

function Section({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Campo({
  label,
  valor,
  mono = false,
}: {
  label: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{label}</span>
      <span
        className={`font-body text-sm text-text-primary ${
          mono
            ? "bg-surface border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all"
            : ""
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
```

- [ ] **Paso 2: Verificar tipos**

```bash
npm run type-check
```

Salida esperada: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add "src/app/(panel)/proyectos/[id]/page.tsx"
git commit -m "feat: página de detalle /proyectos/[id]"
```

---

## Task 11: /proyectos — reemplazar tabla por cards + enlace detalle

**Files:**

- Modify: `src/app/(panel)/proyectos/page.tsx`
- Modify: `src/components/dashboard/ProjectCard.tsx`

- [ ] **Paso 1: Añadir enlace "Ver detalle →" a ProjectCard**

En `src/components/dashboard/ProjectCard.tsx`, añadir el import de `Link` al inicio:

```tsx
import Link from "next/link";
```

En el JSX, después del bloque de `logsOpen` y antes del cierre del `div` principal, añadir:

```tsx
<Link
  href={`/proyectos/${proyecto.id}`}
  className="self-start font-body text-xs text-text-muted hover:text-primary-300 transition-colors duration-[var(--duration-fast)]"
>
  Ver detalle →
</Link>
```

El lugar exacto es después de `{showEditModal && ...}` y antes del cierre del `<div>` exterior.

- [ ] **Paso 2: Reemplazar el contenido de /proyectos/page.tsx**

Reemplazar el contenido completo de `src/app/(panel)/proyectos/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import { ClientSection } from "@/components/dashboard/ClientSection";
import { NuevoClienteButton } from "@/components/dashboard/ClienteForm";
import { StatsBar } from "@/components/dashboard/StatsBar";

export default async function ProyectosPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectosPlanos = clientes.flatMap((c) => c.proyectos);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Proyectos
        </h1>
        <NuevoClienteButton />
      </div>
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

- [ ] **Paso 3: Verificar lint y tipos**

```bash
npm run type-check && npm run lint
```

Salida esperada: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add src/app/(panel)/proyectos/page.tsx src/components/dashboard/ProjectCard.tsx
git commit -m "feat: /proyectos muestra cards con enlace a detalle"
```

---

## Task 12: Dashboard simplificado

**Files:**

- Modify: `src/app/(panel)/page.tsx`

- [ ] **Paso 1: Reemplazar el contenido del dashboard**

Reemplazar el contenido completo de `src/app/(panel)/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createServerCaller } from "@/server/caller";
import type { EstadoServicio } from "@/lib/schemas/dashboard";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
  const proyectos = clientes.flatMap((c) => c.proyectos);

  const stats = {
    clientes: clientes.length,
    proyectos: proyectos.length,
    running: proyectos.filter((p) => p.estado === "running").length,
    error: proyectos.filter((p) => p.estado === "error").length,
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Dashboard
      </h1>

      {/* Resumen */}
      <div className="flex flex-wrap gap-3 mb-8">
        <StatPill count={stats.clientes} label="clientes" />
        <StatPill count={stats.proyectos} label="proyectos" />
        <StatPill
          count={stats.running}
          label="running"
          color="text-state-running"
        />
        <StatPill count={stats.error} label="error" color="text-state-error" />
      </div>

      {/* Lista compacta de clientes */}
      <section className="mb-8">
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Clientes
        </h2>
        {clientes.length === 0 ? (
          <p className="font-body text-sm text-text-muted">
            Sin clientes.{" "}
            <Link
              href="/proyectos"
              className="text-primary-300 hover:underline"
            >
              Ir a Proyectos
            </Link>{" "}
            para crear el primero.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {clientes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3 bg-surface border border-border rounded-[var(--radius-md)]"
              >
                <span className="font-display text-sm font-semibold text-text-primary">
                  {c.nombre}
                </span>
                <div className="flex items-center gap-4">
                  <ResumenEstado proyectos={c.proyectos} />
                  <Link
                    href="/proyectos"
                    className="font-body text-xs text-text-muted hover:text-primary-300 transition-colors duration-[var(--duration-fast)]"
                  >
                    Ver proyectos →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Placeholder métricas */}
      <section>
        <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
          Métricas de sistema
        </h2>
        <div className="border border-dashed border-border rounded-[var(--radius-md)] p-8 text-center">
          <p className="font-body text-xs text-text-muted">
            CPU · RAM · Disco — próximamente
          </p>
        </div>
      </section>
    </div>
  );
}

function StatPill({
  count,
  label,
  color = "text-text-muted",
}: {
  count: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-4 py-2">
      <span className={`font-display text-xl font-bold ${color}`}>{count}</span>
      <span className="font-body text-xs text-text-muted">{label}</span>
    </div>
  );
}

function ResumenEstado({
  proyectos,
}: {
  proyectos: Array<{ estado: EstadoServicio }>;
}) {
  const running = proyectos.filter((p) => p.estado === "running").length;
  const total = proyectos.length;
  return (
    <span className="font-body text-xs text-text-muted">
      <span className="text-state-running">{running}</span>/{total} running
    </span>
  );
}
```

- [ ] **Paso 2: Verificar lint, tipos y tests**

```bash
npm run type-check && npm run lint && npm run test:unit
```

Salida esperada: sin errores, todos los tests PASS.

- [ ] **Paso 3: Commit final**

```bash
git add src/app/(panel)/page.tsx
git commit -m "feat: dashboard simplificado con resumen de clientes y placeholder métricas"
```

---

## Verificación final

- [ ] **Ejecutar suite completa**

```bash
npm run test:unit
```

Salida esperada: todos los tests PASS (207 anteriores + nuevos).

- [ ] **Verificar tipos y lint**

```bash
npm run type-check && npm run lint
```

Salida esperada: 0 errores.
