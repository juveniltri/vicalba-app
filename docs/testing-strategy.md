# Estrategia de Testing — vicalba-app

## Regla 100/80/0

| Tier | Qué contiene | Cobertura mínima | Gate en CI |
|---|---|---|---|
| **Core** | Lógica Docker, lógica Traefik, schemas Zod | **100%** | Sí — bloquea merge |
| **Important** | Componentes UI, hooks | **80%** | Sí — bloquea merge |
| **Infrastructure** | tRPC routers, Next.js App, Prisma, env.ts | **0%** | No aplica |

---

## Mapa de tiers

### Core — 100%

```
src/lib/docker/     ← lógica de comunicación con dockerode (operaciones de contenedor, redes)
src/lib/traefik/    ← generación de config dinámica de Traefik (transformaciones puras)
src/lib/schemas/    ← schemas Zod compartidos (validaciones del dominio)
```

### Important — 80%

```
src/components/     ← componentes React reutilizables
src/hooks/          ← hooks personalizados
```

### Infrastructure — 0% (excluido)

```
src/app/            ← Next.js App Router (pages, layouts, API routes)
src/server/         ← tRPC routers y queries Prisma
src/db/             ← migraciones y seed
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

## Qué testear en `src/lib/docker/`

La lógica Docker es el core más crítico del proyecto — un bug aquí tumba contenedores de producción.

```typescript
// Ejemplo: test del servicio de deploy
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Dockerode from 'dockerode'
import { deployProject } from './deploy'

vi.mock('dockerode')

describe('deployProject', () => {
  it('crea la red del proyecto si no existe', async () => { ... })
  it('lanza los contenedores del compose', async () => { ... })
  it('devuelve error si el repo no es accesible', async () => { ... })
})
```

## Qué testear en `src/lib/traefik/`

La generación de config Traefik son transformaciones puras — sin efectos secundarios, fáciles de testear:

```typescript
// Ejemplo: test de generación de router
import { generateRouter } from './config'

describe('generateRouter', () => {
  it('genera el router con el dominio correcto', () => {
    const config = generateRouter({ domain: 'cliente.example.com', serviceId: 'web' })
    expect(config.rule).toBe('Host(`cliente.example.com`)')
  })
  it('activa TLS en producción', () => { ... })
})
```

---

## Antes de merge a main

- [ ] `npm run test:unit` pasa sin fallos
- [ ] Cobertura Core (`src/lib/`) ≥ 100%
- [ ] Sin tests con `.only` o `.skip` no justificados
