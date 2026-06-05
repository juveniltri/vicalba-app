# Estrategia de Testing — vicalba-app

## Regla 100/80/0

| Tier               | Qué contiene                                         | Cobertura mínima | Gate en CI         |
| ------------------ | ---------------------------------------------------- | ---------------- | ------------------ |
| **Core**           | tRPC routers, schemas Zod, lógica de dominio         | **100%**         | Sí — bloquea merge |
| **Important**      | Componentes UI, hooks, utils                         | **80%**          | Sí — bloquea merge |
| **Infrastructure** | Docker lib, Traefik lib, Next.js App, Prisma, env.ts | **0%**           | No aplica          |

---

## Mapa de tiers

### Core — 100%

```
src/server/routers/ ← tRPC routers (lógica de negocio, validaciones, guards)
src/lib/schemas/    ← schemas Zod compartidos (validaciones del dominio)
src/domain/         ← lógica de dominio pura (si existe)
```

### Important — 80%

```
src/components/     ← componentes React reutilizables
src/hooks/          ← hooks personalizados
src/utils/          ← utilidades puras
```

### Infrastructure — 0% (excluido)

```
src/lib/docker/     ← integración dockerode — se mockea en tests de routers
src/lib/traefik/    ← generación config Traefik — se mockea en tests de routers
src/app/            ← Next.js App Router (pages, layouts, API routes)
src/server/db/      ← queries Prisma
src/env.ts          ← validación de variables de entorno al arranque
```

---

## Tipos de test

### Unitarios (`src/**/*.test.ts`)

- Testean una sola función o módulo en aislamiento
- Docker y Traefik se mockean con `vi.mock('dockerode')` — nunca se conecta al daemon real en tests
- Rápidos: < 50ms por test

### Sin E2E por ahora

Panel interno de 2 usuarios — los tests manuales son suficientes en esta fase. Añadir Playwright cuando el panel tenga flujos estables y un entorno de staging.

---

## Comandos

```bash
npm run test:unit                    # una ejecución (modo CI)
npm run test:unit -- --watch         # modo watch en desarrollo
npm run test:unit -- --coverage      # con informe de cobertura
npm run test:unit -- --ui            # interfaz visual de Vitest
```

---

## Qué testear en `src/server/routers/`

Los routers son el core de la lógica de negocio — guards, validaciones, flujos de error.

```typescript
// Ejemplo: test de guard en proyectos.eliminar
describe('proyectos.eliminar', () => {
  it('elimina el proyecto si está stopped', async () => { ... })
  it('lanza CONFLICT si el proyecto está running', async () => { ... })
  it('lanza NOT_FOUND si el proyecto no existe', async () => { ... })
})
```

Los routers mockean `@/lib/docker/proyectos` y `@/lib/prisma` — nunca tocan Docker real ni DB real.

---

## Antes de merge a main

- [ ] `npm run test:unit` pasa sin fallos
- [ ] Cobertura Core (`src/lib/`) ≥ 100%
- [ ] Sin tests con `.only` o `.skip` no justificados
