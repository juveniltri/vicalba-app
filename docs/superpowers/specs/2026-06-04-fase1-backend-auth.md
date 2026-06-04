# Fase 1 — Backend real + Auth

**Fecha:** 2026-06-04  
**Estado:** Aprobado  
**Alcance:** Prisma schema + migraciones + seed, NextAuth v5 con Credentials, tRPC v11 con `proyectos.listar`, reemplazo de mock data en `page.tsx`. Los botones de acción en `ProjectCard` siguen siendo stubs.

---

## Contexto

El dashboard existe con datos ficticios (Fase 0). Esta fase conecta la capa de datos real: base de datos PostgreSQL via Prisma, autenticación con NextAuth v5, y una API tRPC que sirve los proyectos al dashboard. El árbol de componentes UI no cambia.

---

## Decisiones de diseño

| Decisión            | Elección                               | Alternativas descartadas       |
| ------------------- | -------------------------------------- | ------------------------------ |
| ORM                 | Prisma                                 | Drizzle, Kysely                |
| Auth                | NextAuth v5 + Credentials + bcrypt     | OAuth, magic links             |
| API                 | tRPC v11                               | REST, GraphQL                  |
| Estado del proyecto | Almacenado en DB                       | Consulta Docker en tiempo real |
| Serialización tRPC  | superjson                              | JSON nativo                    |
| `ultimoDeploy.hace` | Calculado en servidor desde `DateTime` | Almacenado como string         |

### Decisión clave: estado en DB

El campo `estado` (`running | stopped | error | deploying`) se guarda en la DB y es la fuente de verdad del estado conocido del proyecto. Las acciones del panel (start/stop/deploy) actualizarán este estado via mutations tRPC (Fase 2). Cuando se integre dockerode (Fase 3), será dockerode quien actualice el estado en DB tras cada operación.

---

## Schema Prisma

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
  id                String         @id @default(cuid())
  nombre            String
  cliente           Cliente        @relation(fields: [clienteId], references: [id])
  clienteId         String
  estado            EstadoServicio @default(stopped)
  dominio           String?
  ultimoDeployEn    DateTime?
  ultimoDeployRama  String?
  servicios         Servicio[]
  creadoEn          DateTime       @default(now())
  actualizadoEn     DateTime       @updatedAt
}

model Servicio {
  id        String         @id @default(cuid())
  nombre    String
  estado    EstadoServicio @default(stopped)
  proyecto  Proyecto       @relation(fields: [proyectoId], references: [id])
  proyectoId String
  creadoEn  DateTime       @default(now())
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nombre       String
  creadoEn     DateTime @default(now())
}
```

---

## Arquitectura de componentes y ficheros

```
prisma/
  schema.prisma       ← schema de DB
  migrations/         ← generado por prisma migrate dev
  seed.ts             ← datos de desarrollo (mismos que mock-data.ts)

src/
  lib/
    prisma.ts         ← singleton PrismaClient
    auth.ts           ← configuración NextAuth v5 (providers, callbacks)
    formatHace.ts     ← convierte DateTime → "hace 2h"
  server/
    trpc.ts           ← init tRPC (contexto, middleware de auth)
    routers/
      proyectos.ts    ← router proyectos.listar
      _app.ts         ← appRouter = mergeRouters(...)
  app/
    api/
      trpc/
        [trpc]/
          route.ts    ← handler HTTP de tRPC
      auth/
        [...nextauth]/
          route.ts    ← handler NextAuth
    (auth)/
      login/
        page.tsx      ← formulario de login
    (panel)/
      page.tsx        ← actualizado: usa server-side caller tRPC
  middleware.ts       ← protege rutas (panel)/* — redirige a /login si sin sesión
  env.ts             ← añadir DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
```

---

## Capa de autenticación

### NextAuth v5 — Credentials provider

```ts
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

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

### Middleware de protección

```ts
// middleware.ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/(panel)/:path*"],
};
```

### Login page

Formulario mínimo: campo email + campo password + botón "Entrar". Server Action que llama `signIn("credentials", ...)`. Sin registro de usuarios — las cuentas se crean via seed o script manual.

---

## Capa tRPC

### Contexto y middleware

```ts
// src/server/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/lib/auth";
import superjson from "superjson";

export async function createContext() {
  const session = await auth();
  return { session };
}

const t = initTRPC.context<typeof createContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
```

### Router proyectos

```ts
// src/server/routers/proyectos.ts
import { router, protectedProcedure } from "@/server/trpc";
import { prisma } from "@/lib/prisma";
import { formatHace } from "@/lib/formatHace";

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

El tipo de retorno es compatible con `Cliente[]` de `mock-data.ts` — los componentes existentes no necesitan cambios.

### App router y handler HTTP

```ts
// src/server/routers/_app.ts
import { router } from "@/server/trpc";
import { proyectosRouter } from "./proyectos";

export const appRouter = router({ proyectos: proyectosRouter });
export type AppRouter = typeof appRouter;
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
    createContext,
  });

export { handler as GET, handler as POST };
```

### Server-side caller (para Server Components)

```ts
// src/server/caller.ts
import { createCallerFactory } from "@trpc/server";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc";

const createCaller = createCallerFactory(appRouter);

export async function createServerCaller() {
  const ctx = await createContext();
  return createCaller(ctx);
}
```

---

## Cambio en page.tsx

```ts
// src/app/(panel)/page.tsx — tras la fase 1
import { createServerCaller } from "@/server/caller"
import { StatsBar } from "@/components/dashboard/StatsBar"
import { ClientSection } from "@/components/dashboard/ClientSection"

export default async function DashboardPage() {
  const api = await createServerCaller()
  const clientes = await api.proyectos.listar()
  const proyectosPlanos = clientes.flatMap((c) => c.proyectos)

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">Dashboard</h1>
      <StatsBar proyectos={proyectosPlanos} />
      <div className="flex flex-col gap-8">
        {clientes.map((cliente) => (
          <ClientSection key={cliente.slug} cliente={cliente} />
        ))}
      </div>
    </div>
  )
}
```

---

## Utilidad formatHace

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

---

## Seed de desarrollo

`prisma/seed.ts` carga los mismos datos que `mock-data.ts` (2 clientes, 4 proyectos) más un usuario de desarrollo:

```
email: admin@vicalba.local
password: dev-password-2026   (hasheada con bcrypt rounds=12)
```

---

## Variables de entorno

Añadir a `.env.local` (no al repo):

```
DATABASE_URL="postgresql://user:pass@localhost:5432/vicalba_dev"
NEXTAUTH_SECRET="<generado con openssl rand -hex 32>"
NEXTAUTH_URL="http://localhost:3000"
```

Añadir a `src/env.ts` con validación Zod.

---

## Estrategia de testing (regla 100/80/0)

| Fichero                           | Tier           | Cobertura | Qué se testea                                       |
| --------------------------------- | -------------- | --------- | --------------------------------------------------- |
| `src/server/routers/proyectos.ts` | Core           | 100%      | listar devuelve estructura correcta; 401 sin sesión |
| `src/lib/formatHace.ts`           | Core           | 100%      | Minutos, horas y días correctos; edge cases         |
| `src/lib/auth.ts`                 | Infrastructure | 0%        | No se testea                                        |
| `src/lib/prisma.ts`               | Infrastructure | 0%        | No se testea                                        |
| `src/app/(auth)/login/page.tsx`   | Important      | 80%       | Renderiza formulario; campos accesibles             |
| `middleware.ts`                   | Infrastructure | 0%        | No se testea                                        |

Los tests de `proyectos.ts` usan un PrismaClient mockeado con `vi.mock`.

---

## Dependencias a instalar

```bash
# Runtime
npm install prisma @prisma/client
npm install next-auth@beta
npm install @trpc/server @trpc/client superjson
npm install bcryptjs zod

# Dev
npm install -D @types/bcryptjs tsx
```

---

## Flujo de datos final

```
PostgreSQL → Prisma → proyectosRouter.listar → createServerCaller → page.tsx → StatsBar + ClientSection[] → ProjectCard[]
```

NextAuth protege el acceso: sin sesión JWT válida, el middleware redirige a `/login` antes de que page.tsx se ejecute.

---

## Lo que queda fuera de este spec

- Mutations tRPC (start/stop/deploy) — los botones siguen siendo stubs
- Integración dockerode para estado real de contenedores
- CRUD de clientes/proyectos desde la UI
- Logs en tiempo real (SSE)
- Registro de usuarios desde la UI
