# Fase 1 — Backend real + Auth: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el dashboard al backend real: Prisma + PostgreSQL, NextAuth v5 con Credentials, tRPC v11 con `proyectos.listar`, y protección de rutas con middleware.

**Architecture:** Prisma gestiona la DB (PostgreSQL). NextAuth v5 con JWT strategy protege las rutas del panel vía middleware de Next.js. Un router tRPC expone `proyectos.listar` consumido desde `page.tsx` mediante un server-side caller. Los componentes UI no cambian.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Prisma 6, NextAuth v5 (beta), tRPC v11, superjson, bcryptjs, Vitest, Testing Library

---

## Mapa de ficheros

| Fichero                                   | Acción    | Responsabilidad                           |
| ----------------------------------------- | --------- | ----------------------------------------- |
| `prisma/schema.prisma`                    | Crear     | Modelos Cliente, Proyecto, Servicio, User |
| `prisma/seed.ts`                          | Crear     | Datos dev (=mock-data.ts) + usuario admin |
| `src/lib/prisma.ts`                       | Crear     | Singleton PrismaClient                    |
| `src/lib/auth.ts`                         | Crear     | Config NextAuth v5 (Credentials + bcrypt) |
| `src/lib/formatHace.ts`                   | Crear     | `DateTime → "hace 2h"`                    |
| `src/lib/formatHace.test.ts`              | Crear     | Tests 100% (Core)                         |
| `src/server/trpc.ts`                      | Crear     | Init tRPC, contexto, procedures           |
| `src/server/routers/proyectos.ts`         | Crear     | Router `proyectos.listar`                 |
| `src/server/routers/proyectos.test.ts`    | Crear     | Tests 100% (Core)                         |
| `src/server/routers/_app.ts`              | Crear     | appRouter + AppRouter type                |
| `src/server/caller.ts`                    | Crear     | Server-side caller para Server Components |
| `src/app/api/trpc/[trpc]/route.ts`        | Crear     | Handler HTTP tRPC                         |
| `src/app/api/auth/[...nextauth]/route.ts` | Crear     | Handler NextAuth                          |
| `src/app/(auth)/login/page.tsx`           | Crear     | Thin wrapper: importa LoginForm           |
| `src/components/auth/LoginForm.tsx`       | Crear     | Formulario de login ("use client")        |
| `src/components/auth/LoginForm.test.tsx`  | Crear     | Tests 80% (Important)                     |
| `src/app/(panel)/page.tsx`                | Modificar | Reemplazar mock import por tRPC caller    |
| `vitest.config.ts`                        | Modificar | Añadir coverage para routers + formatHace |
| `package.json`                            | Modificar | Añadir `prisma.seed` + dependencias       |

---

## Task 1: Crear rama de feature

**Files:**

- (git only)

- [ ] **Step 1: Crear rama desde master**

```powershell
git checkout master
git checkout -b feature/fase1-backend-auth
```

Expected: `Switched to a new branch 'feature/fase1-backend-auth'`

---

## Task 2: Instalar dependencias

**Files:**

- Modify: `package.json`

**Prerequisito:** Node.js y npm disponibles. PostgreSQL corriendo en `localhost:5432` con una base de datos `vicalba_dev` creada (o se creará en Task 5).

- [ ] **Step 1: Instalar dependencias runtime**

```powershell
npm install prisma @prisma/client next-auth@beta @trpc/server @trpc/client superjson bcryptjs zod
```

- [ ] **Step 2: Instalar dependencias dev**

```powershell
npm install -D @types/bcryptjs tsx
```

- [ ] **Step 3: Verificar que instaló correctamente**

```powershell
npm ls prisma @prisma/client next-auth @trpc/server superjson bcryptjs --depth=0
```

Expected: lista sin errores, versiones visibles.

- [ ] **Step 4: Añadir configuración del seed en package.json**

Abrir `package.json` y añadir la clave `"prisma"` al nivel raíz (después de `"lint-staged"`):

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

`package.json` completo tras el cambio (solo la parte nueva):

```json
  "lint-staged": { ... },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: install prisma, next-auth v5, trpc, superjson, bcryptjs"
```

---

## Task 3: Crear .env.local

**Files:**

- Create: `.env.local` (no se commitea — está en .gitignore)

- [ ] **Step 1: Crear .env.local con todas las variables requeridas**

Crear el fichero `.env.local` en la raíz del proyecto con:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vicalba_dev"
NEXTAUTH_SECRET="desarrollo-local-secret-32-caracteres-minimo"
NEXTAUTH_URL="http://localhost:3000"
GITHUB_WEBHOOK_SECRET="dev-webhook-secret-placeholder"
```

Ajustar `DATABASE_URL` a las credenciales reales de tu PostgreSQL local.

- [ ] **Step 2: Verificar que .env.local está en .gitignore**

```powershell
Select-String -Path ".gitignore" -Pattern "\.env\.local"
```

Expected: línea con `.env.local`. Si no aparece, añadirla.

---

## Task 4: Prisma schema

**Files:**

- Create: `prisma/schema.prisma`

- [ ] **Step 1: Crear directorio prisma y schema**

```powershell
New-Item -ItemType Directory -Path prisma -Force
```

- [ ] **Step 2: Crear prisma/schema.prisma**

Contenido completo del fichero:

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum EstadoServicio {
  running
  stopped
  error
  deploying
}

model Cliente {
  id        String     @id @default(cuid())
  slug      String     @unique
  nombre    String
  proyectos Proyecto[]
  creadoEn  DateTime   @default(now())
}

model Proyecto {
  id               String         @id @default(cuid())
  nombre           String
  cliente          Cliente        @relation(fields: [clienteId], references: [id])
  clienteId        String
  estado           EstadoServicio @default(stopped)
  dominio          String?
  ultimoDeployEn   DateTime?
  ultimoDeployRama String?
  servicios        Servicio[]
  creadoEn         DateTime       @default(now())
  actualizadoEn    DateTime       @updatedAt
}

model Servicio {
  id         String         @id @default(cuid())
  nombre     String
  estado     EstadoServicio @default(stopped)
  proyecto   Proyecto       @relation(fields: [proyectoId], references: [id])
  proyectoId String
  creadoEn   DateTime       @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nombre       String
  creadoEn     DateTime @default(now())
}
```

- [ ] **Step 3: Commit**

```powershell
git add prisma/schema.prisma
git commit -m "feat: add prisma schema (Cliente, Proyecto, Servicio, User)"
```

---

## Task 5: Primera migración + PrismaClient singleton

**Files:**

- Create: `prisma/migrations/` (generado por Prisma)
- Create: `src/lib/prisma.ts`

**Prerequisito:** PostgreSQL corriendo y `DATABASE_URL` configurada en `.env.local`.

- [ ] **Step 1: Ejecutar la migración inicial**

```powershell
npx prisma migrate dev --name init
```

Expected output:

```
Environment variables loaded from .env.local
Prisma schema loaded from prisma/schema.prisma
...
The following migration(s) have been created and applied:
migrations/20260604XXXXXX_init/migration.sql
```

Si falla con "Can't reach database server", verificar que PostgreSQL está corriendo y la URL es correcta.

- [ ] **Step 2: Generar el cliente Prisma**

El paso anterior lo hace automáticamente, pero verificar:

```powershell
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 3: Crear src/lib/prisma.ts**

```ts
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Commit**

```powershell
git add prisma/ src/lib/prisma.ts
git commit -m "feat: add prisma migration and PrismaClient singleton"
```

---

## Task 6: Seed de desarrollo

**Files:**

- Create: `prisma/seed.ts`

- [ ] **Step 1: Crear prisma/seed.ts**

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.servicio.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("dev-password-2026", 12);
  await prisma.user.create({
    data: { email: "admin@vicalba.local", passwordHash, nombre: "Admin" },
  });

  const clienteUno = await prisma.cliente.create({
    data: { slug: "cliente-uno", nombre: "Cliente Uno" },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "web-app",
      clienteId: clienteUno.id,
      estado: "running",
      dominio: "app.cliente-uno.com",
      ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
      servicios: {
        create: [
          { nombre: "nginx", estado: "running" },
          { nombre: "node", estado: "running" },
        ],
      },
    },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "api",
      clienteId: clienteUno.id,
      estado: "stopped",
      dominio: "api.cliente-uno.com",
      ultimoDeployEn: new Date(Date.now() - 5 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
      servicios: { create: [{ nombre: "fastapi", estado: "stopped" }] },
    },
  });

  const clienteDos = await prisma.cliente.create({
    data: { slug: "cliente-dos", nombre: "Cliente Dos" },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "landing",
      clienteId: clienteDos.id,
      estado: "error",
      dominio: "landing.cliente-dos.com",
      ultimoDeployEn: new Date(Date.now() - 24 * 60 * 60 * 1000),
      ultimoDeployRama: "main",
      servicios: { create: [{ nombre: "nginx", estado: "error" }] },
    },
  });

  await prisma.proyecto.create({
    data: {
      nombre: "worker",
      clienteId: clienteDos.id,
      estado: "deploying",
      dominio: null,
      ultimoDeployEn: new Date(Date.now() - 10 * 60 * 1000),
      ultimoDeployRama: "develop",
      servicios: { create: [{ nombre: "celery", estado: "deploying" }] },
    },
  });

  console.log("✅ Seed completado");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Ejecutar el seed**

```powershell
npm run db:seed
```

Expected: `✅ Seed completado`

- [ ] **Step 3: Commit**

```powershell
git add prisma/seed.ts
git commit -m "feat: add development seed with mock data and admin user"
```

---

## Task 7: Actualizar vitest.config.ts para coverage de routers y lib

**Files:**

- Modify: `vitest.config.ts`

El config actual excluye `src/server/**` completo, pero `src/server/routers/**` debe tener 100% (Core tier). También falta threshold para `src/lib/formatHace.ts`.

- [ ] **Step 1: Reemplazar vitest.config.ts con el nuevo contenido**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "dist/**",
        ".next/**",
        "coverage/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/test/**",
        // Infrastructure tier
        "src/app/**",
        "src/db/**",
        "src/env.ts",
        "src/styles/**",
        // Lib infrastructure (configuración, sin lógica de negocio)
        "src/lib/prisma.ts",
        "src/lib/auth.ts",
        "src/lib/sentry.ts",
        "src/lib/logger.ts",
        // Server infrastructure
        "src/server/trpc.ts",
        "src/server/caller.ts",
        "src/server/routers/_app.ts",
      ],
      thresholds: {
        // Core — 100%
        "src/server/routers/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/formatHace.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/docker/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/traefik/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/schemas/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        // Important — 80%
        "src/components/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "src/hooks/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
```

- [ ] **Step 2: Verificar que los tests existentes siguen pasando**

```powershell
npm run test:unit -- --run
```

Expected: `25 passed (25)` — los tests del dashboard siguen en verde.

- [ ] **Step 3: Commit**

```powershell
git add vitest.config.ts
git commit -m "chore: update coverage config for server/routers and lib/formatHace"
```

---

## Task 8: formatHace utility (TDD)

**Files:**

- Create: `src/lib/formatHace.test.ts`
- Create: `src/lib/formatHace.ts`

- [ ] **Step 1: Escribir el test (RED)**

```ts
// src/lib/formatHace.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatHace } from "./formatHace";

describe("formatHace", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns minutes when less than 60 minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T11:45:00Z"))).toBe("hace 15m");
  });

  it("returns 0m when date is the current time", () => {
    vi.useFakeTimers();
    const now = new Date("2026-06-04T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatHace(now)).toBe("hace 0m");
  });

  it("returns 1h at exactly 60 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T11:00:00Z"))).toBe("hace 1h");
  });

  it("returns hours when between 1 and 23 hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-04T10:00:00Z"))).toBe("hace 2h");
  });

  it("returns 1d at exactly 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-03T12:00:00Z"))).toBe("hace 1d");
  });

  it("returns days when 24 or more hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T12:00:00Z"));
    expect(formatHace(new Date("2026-06-02T12:00:00Z"))).toBe("hace 2d");
  });
});
```

- [ ] **Step 2: Verificar que el test falla (módulo no existe)**

```powershell
npm run test:unit -- --run src/lib/formatHace.test.ts
```

Expected: FAIL con `Cannot find module './formatHace'`

- [ ] **Step 3: Implementar formatHace.ts**

```ts
// src/lib/formatHace.ts
export function formatHace(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
```

- [ ] **Step 4: Verificar que los tests pasan**

```powershell
npm run test:unit -- --run src/lib/formatHace.test.ts
```

Expected: `6 passed (6)`

- [ ] **Step 5: Commit**

```powershell
git add src/lib/formatHace.ts src/lib/formatHace.test.ts
git commit -m "feat: add formatHace utility with 100% test coverage"
```

---

## Task 9: NextAuth v5 setup

**Files:**

- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Crear src/lib/auth.ts**

```ts
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.nombre };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
});
```

- [ ] **Step 2: Crear el directorio y handler de NextAuth**

```powershell
New-Item -ItemType Directory -Path "src/app/api/auth/[...nextauth]" -Force
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 3: Verificar type-check sin errores**

```powershell
npm run type-check
```

Expected: sin errores de TypeScript.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/auth.ts "src/app/api/auth/[...nextauth]/route.ts"
git commit -m "feat: add NextAuth v5 with Credentials provider"
```

---

## Task 10: Login page (TDD)

**Files:**

- Create: `src/components/auth/LoginForm.tsx`
- Create: `src/components/auth/LoginForm.test.tsx`
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Escribir el test de LoginForm (RED)**

```tsx
// src/components/auth/LoginForm.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn().mockResolvedValue({ error: null }),
}));

import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input with label", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("renders password input with label", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<LoginForm />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar el test para confirmar que falla**

```powershell
npm run test:unit -- --run src/components/auth/LoginForm.test.tsx
```

Expected: FAIL con `Cannot find module './LoginForm'`

- [ ] **Step 3: Implementar LoginForm.tsx**

```tsx
// src/components/auth/LoginForm.tsx
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = e.currentTarget;
    const result = await signIn("credentials", {
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      password: (form.elements.namedItem("password") as HTMLInputElement).value,
      redirect: false,
    });
    if (result?.error) {
      setError("Credenciales incorrectas");
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="w-full max-w-sm p-8 bg-surface border border-border rounded-[var(--radius-md)]">
      <h1 className="font-display text-xl font-bold text-text-primary mb-6">
        VICALBA
      </h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="font-body text-sm text-text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="px-3 py-2 bg-background border border-border rounded-[var(--radius-sm)] font-body text-sm text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="font-body text-sm text-text-muted"
          >
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="px-3 py-2 bg-background border border-border rounded-[var(--radius-sm)] font-body text-sm text-text-primary focus:outline-none focus:border-primary-500"
          />
        </div>
        {error && (
          <p role="alert" className="font-body text-sm text-state-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 px-4 py-2 bg-primary-500 text-white font-body text-sm font-medium rounded-[var(--radius-sm)] hover:bg-primary-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el test para confirmar que pasa**

```powershell
npm run test:unit -- --run src/components/auth/LoginForm.test.tsx
```

Expected: `3 passed (3)`

- [ ] **Step 5: Crear la login page (thin wrapper)**

```powershell
New-Item -ItemType Directory -Path "src/app/(auth)/login" -Force
```

```tsx
// src/app/(auth)/login/page.tsx
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 6: Ejecutar todos los tests para confirmar que nada se rompió**

```powershell
npm run test:unit -- --run
```

Expected: `28 passed (28)` (25 previos + 3 nuevos de LoginForm)

- [ ] **Step 7: Commit**

```powershell
git add src/components/auth/ "src/app/(auth)/"
git commit -m "feat: add login page with LoginForm component (TDD)"
```

---

## Task 11: Middleware de protección de rutas

**Files:**

- Create: `middleware.ts` (en la raíz del proyecto, junto a `package.json`)

- [ ] **Step 1: Crear middleware.ts**

```ts
// middleware.ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  // Protege todas las rutas excepto: login, api/*, _next/*, favicon.ico
  matcher: ["/((?!login|api|_next/static|_next/image|favicon\\.ico).*)"],
};
```

- [ ] **Step 2: Verificar type-check**

```powershell
npm run type-check
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add middleware.ts
git commit -m "feat: add NextAuth middleware to protect panel routes"
```

---

## Task 12: tRPC init

**Files:**

- Create: `src/server/trpc.ts`

- [ ] **Step 1: Crear src/server/trpc.ts**

```ts
// src/server/trpc.ts
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";

export async function createContext() {
  const session = await auth();
  return { session };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

- [ ] **Step 2: Verificar type-check**

```powershell
npm run type-check
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```powershell
git add src/server/trpc.ts
git commit -m "feat: add tRPC init with auth context and protected procedure"
```

---

## Task 13: proyectos router (TDD) + appRouter

**Files:**

- Create: `src/server/routers/proyectos.test.ts`
- Create: `src/server/routers/proyectos.ts`
- Create: `src/server/routers/_app.ts`

- [ ] **Step 1: Escribir el test (RED)**

```ts
// src/server/routers/proyectos.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cliente: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const mockDbData = [
  {
    id: "c1",
    slug: "cliente-uno",
    nombre: "Cliente Uno",
    creadoEn: new Date(),
    proyectos: [
      {
        id: "p1",
        nombre: "web-app",
        clienteId: "c1",
        estado: "running" as const,
        dominio: "app.cliente-uno.com",
        ultimoDeployEn: new Date(Date.now() - 2 * 60 * 60 * 1000),
        ultimoDeployRama: "main",
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        servicios: [
          {
            id: "s1",
            nombre: "nginx",
            estado: "running" as const,
            proyectoId: "p1",
            creadoEn: new Date(),
          },
        ],
      },
    ],
  },
];

describe("proyectos.listar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clientes with proyectos when authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("cliente-uno");
    expect(result[0].proyectos[0].estado).toBe("running");
    expect(result[0].proyectos[0].dominio).toBe("app.cliente-uno.com");
    expect(result[0].proyectos[0].servicios[0].nombre).toBe("nginx");
  });

  it("maps ultimoDeployEn + rama to ultimoDeploy object", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result[0].proyectos[0].ultimoDeploy).not.toBeNull();
    expect(result[0].proyectos[0].ultimoDeploy?.rama).toBe("main");
    expect(result[0].proyectos[0].ultimoDeploy?.hace).toMatch(/hace \d+[mhd]/);
  });

  it("returns null ultimoDeploy when ultimoDeployEn is null", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      {
        ...mockDbData[0],
        proyectos: [
          {
            ...mockDbData[0].proyectos[0],
            ultimoDeployEn: null,
            ultimoDeployRama: null,
          },
        ],
      },
    ] as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    const result = await caller.proyectos.listar();

    expect(result[0].proyectos[0].ultimoDeploy).toBeNull();
  });

  it("calls prisma with correct query options", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.cliente.findMany).mockResolvedValue(mockDbData as never);

    const ctx = await createContext();
    const caller = createCaller(ctx);
    await caller.proyectos.listar();

    expect(prisma.cliente.findMany).toHaveBeenCalledWith({
      include: {
        proyectos: {
          include: { servicios: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });
  });

  it("throws UNAUTHORIZED when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    const caller = createCaller(ctx);

    await expect(caller.proyectos.listar()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Crear stubs para que el test compile**

Primero `_app.ts` stub (vacío, para que el import compile):

```ts
// src/server/routers/_app.ts
import { router } from "@/server/trpc";

export const appRouter = router({});
export type AppRouter = typeof appRouter;
```

Luego `proyectos.ts` stub:

```ts
// src/server/routers/proyectos.ts
import { router } from "@/server/trpc";

export const proyectosRouter = router({});
```

- [ ] **Step 3: Ejecutar el test para confirmar que falla con error de aserción**

```powershell
npm run test:unit -- --run src/server/routers/proyectos.test.ts
```

Expected: FAIL — `proyectos.listar is not a function` o similar.

- [ ] **Step 4: Implementar proyectos.ts con listar**

```ts
// src/server/routers/proyectos.ts
import { formatHace } from "@/lib/formatHace";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

export const proyectosRouter = router({
  listar: protectedProcedure.query(async () => {
    const clientes = await prisma.cliente.findMany({
      include: {
        proyectos: {
          include: { servicios: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });

    return clientes.map((cliente) => ({
      slug: cliente.slug,
      nombre: cliente.nombre,
      proyectos: cliente.proyectos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        clienteSlug: cliente.slug,
        estado: p.estado,
        dominio: p.dominio,
        servicios: p.servicios.map((s) => ({
          nombre: s.nombre,
          estado: s.estado,
        })),
        ultimoDeploy:
          p.ultimoDeployEn && p.ultimoDeployRama
            ? { hace: formatHace(p.ultimoDeployEn), rama: p.ultimoDeployRama }
            : null,
      })),
    }));
  }),
});
```

- [ ] **Step 5: Actualizar \_app.ts con el router real**

```ts
// src/server/routers/_app.ts
import { router } from "@/server/trpc";
import { proyectosRouter } from "./proyectos";

export const appRouter = router({
  proyectos: proyectosRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 6: Ejecutar el test para confirmar que pasa**

```powershell
npm run test:unit -- --run src/server/routers/proyectos.test.ts
```

Expected: `5 passed (5)`

- [ ] **Step 7: Ejecutar todos los tests**

```powershell
npm run test:unit -- --run
```

Expected: `33 passed (33)` (28 previos + 5 nuevos)

- [ ] **Step 8: Commit**

```powershell
git add src/server/routers/
git commit -m "feat: add proyectos tRPC router with listar procedure (TDD)"
```

---

## Task 14: tRPC HTTP handler + server-side caller

**Files:**

- Create: `src/app/api/trpc/[trpc]/route.ts`
- Create: `src/server/caller.ts`

- [ ] **Step 1: Crear el directorio y el handler HTTP**

```powershell
New-Item -ItemType Directory -Path "src/app/api/trpc/[trpc]" -Force
```

```ts
// src/app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(),
  });

export { handler as GET, handler as POST };
```

- [ ] **Step 2: Crear el server-side caller**

```ts
// src/server/caller.ts
import { createCallerFactory, createContext } from "./trpc";
import { appRouter } from "./routers/_app";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  const ctx = await createContext();
  return createCaller(ctx);
}
```

- [ ] **Step 3: Verificar type-check**

```powershell
npm run type-check
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/api/trpc/" src/server/caller.ts
git commit -m "feat: add tRPC HTTP handler and server-side caller"
```

---

## Task 15: Actualizar page.tsx + verificar suite completa

**Files:**

- Modify: `src/app/(panel)/page.tsx`

- [ ] **Step 1: Reemplazar el import de mock-data por el caller tRPC**

Contenido completo de `src/app/(panel)/page.tsx` tras el cambio:

```tsx
// src/app/(panel)/page.tsx
import { ClientSection } from "@/components/dashboard/ClientSection";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { createServerCaller } from "@/server/caller";

export default async function DashboardPage() {
  const api = await createServerCaller();
  const clientes = await api.proyectos.listar();
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

- [ ] **Step 2: Verificar type-check**

```powershell
npm run type-check
```

Expected: sin errores.

- [ ] **Step 3: Ejecutar la suite completa de tests**

```powershell
npm run test:unit -- --run
```

Expected: `33 passed (33)` — todos los tests en verde.

- [ ] **Step 4: Verificar coverage**

```powershell
npm run test:unit -- --run --coverage
```

Expected:

- `src/server/routers/proyectos.ts`: ≥ 100% en branches, functions, lines, statements
- `src/lib/formatHace.ts`: 100% en todas las métricas
- `src/components/**`: ≥ 80%

- [ ] **Step 5: Verificar lint**

```powershell
npm run lint
```

Expected: 0 errores, 0 warnings.

- [ ] **Step 6: Commit**

```powershell
git add "src/app/(panel)/page.tsx"
git commit -m "feat: replace mock-data with tRPC server-side caller in dashboard"
```

---

## Verificación manual (opcional pero recomendada)

Con PostgreSQL corriendo y `.env.local` configurado:

```powershell
npm run dev
```

1. Navegar a `http://localhost:3000` → debe redirigir a `/login`
2. Entrar con `admin@vicalba.local` / `dev-password-2026`
3. Debe mostrar el dashboard con los datos del seed (Cliente Uno + Cliente Dos)
4. Los datos deben coincidir con los del mock anterior (mismos proyectos, mismos estados)
