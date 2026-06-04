# Dashboard UI — Especificación de diseño

**Fecha:** 2026-06-04  
**Estado:** Aprobado  
**Alcance:** UI con datos ficticios (Fase 0 → validación de diseño antes de conectar backend)

---

## Contexto

El dashboard es la primera pantalla que ve el usuario al entrar al panel. Muestra el estado de todos los proyectos Docker agrupados por cliente, con acciones rápidas por proyecto. En esta fase se implementa con datos ficticios hardcodeados para validar el diseño antes de conectar tRPC + Prisma + dockerode.

---

## Decisiones de diseño

| Decisión                    | Elección                           | Alternativas descartadas             |
| --------------------------- | ---------------------------------- | ------------------------------------ |
| Navegación                  | Sidebar fijo izquierda             | Top nav                              |
| Presentación de proyectos   | Tarjetas (cards)                   | Lista de filas                       |
| Agrupación                  | Por cliente                        | Lista plana                          |
| Detalle de tarjeta          | Dominio + último deploy + rama     | Minimalista / con servicios internos |
| Métricas globales           | Barra de resumen superior          | Sin barra                            |
| Arquitectura de componentes | Server Components + Client islands | Todo client / Todo server            |

---

## Arquitectura de componentes

```
src/
  app/
    (panel)/
      layout.tsx          ← Server Component: sidebar + área principal
      page.tsx            ← Server Component: importa mock data, compone el dashboard
  components/
    layout/
      Sidebar.tsx         ← Server Component: navegación izquierda con ítem activo
    dashboard/
      StatsBar.tsx        ← Server Component: contadores globales (total / running / stopped / error)
      ClientSection.tsx   ← Server Component: encabezado de cliente + grid de tarjetas
      ProjectCard.tsx     ← Client Component: tarjeta de proyecto con botones interactivos
      StatusBadge.tsx     ← Server Component: badge de estado con tokens de color del dominio
  lib/
    mock-data.ts          ← Tipos del dominio + datos ficticios (sin "use client")
```

**Regla de Client Components:** solo `ProjectCard` es `"use client"` porque es el único componente que necesita estado local (spinner al ejecutar acción, deshabilitado durante deploy). Todo lo demás es Server Component.

---

## Tipos del dominio (`src/lib/mock-data.ts`)

```ts
type EstadoServicio = "running" | "stopped" | "error" | "deploying";

type Servicio = {
  nombre: string;
  estado: EstadoServicio;
};

type Proyecto = {
  id: string;
  nombre: string;
  clienteSlug: string;
  estado: EstadoServicio;
  servicios: Servicio[];
  dominio: string | null;
  ultimoDeploy: { hace: string; rama: string } | null;
};

type Cliente = {
  slug: string;
  nombre: string;
  proyectos: Proyecto[];
};
```

Estos tipos son la fuente de verdad para los tests de componentes. Cuando se integre Prisma, el schema de DB debe producir objetos compatibles con estos tipos.

---

## Layout visual

```
┌──────────┬──────────────────────────────────────────────────────┐
│ VICALBA  │  Dashboard                                           │
│──────────│──────────────────────────────────────────────────────│
│          │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│ ● Dashb. │  │ 8 total  │ │● 5 runn. │ │■ 2 stop. │ │⚠ 1 err│  │
│  Proyect │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│  Config  │                                                      │
│          │  ── cliente-uno ──────────────────────────────────── │
│          │  ┌──────────────────┐  ┌──────────────────┐         │
│          │  │ web-app          │  │ api              │         │
│          │  │ ● running        │  │ ■ stopped        │         │
│          │  │ app.cliente1.com │  │ api.cliente1.com │         │
│          │  │ main · hace 2h   │  │ main · hace 5h   │         │
│          │  │ [■ Stop][⚡ Deploy]│ │[▶ Start][⚡ Deploy]│       │
│          │  └──────────────────┘  └──────────────────┘         │
│          │                                                      │
│          │  ── cliente-dos ──────────────────────────────────── │
│          │  ┌──────────────────┐                               │
│          │  │ landing          │                               │
│          │  │ ⚠ error          │                               │
│          │  │ landing.c2.com   │                               │
│          │  │ main · hace 1d   │                               │
│          │  │ [▶ Start][⚡ Deploy]│                             │
│          │  └──────────────────┘                               │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## Comportamiento de acciones por estado

| Estado      | Botones visibles                                |
| ----------- | ----------------------------------------------- |
| `running`   | Stop, Restart, Deploy                           |
| `stopped`   | Start, Deploy                                   |
| `error`     | Start, Restart, Deploy                          |
| `deploying` | _(deshabilitado, spinner)_ — sin otras acciones |

Durante `deploying`, todos los botones de esa tarjeta quedan deshabilitados. El estado se muestra con el badge `--color-state-deploying` (#F59E0B) y un spinner de animación.

---

## Identidad visual

Se siguen los tokens de `src/styles/tokens.css` sin excepción. No se hardcodean colores en componentes.

| Token                                 | Uso en dashboard                       |
| ------------------------------------- | -------------------------------------- |
| `--color-state-running` (`#22D3EE`)   | Badge running                          |
| `--color-state-stopped` (`#475569`)   | Badge stopped                          |
| `--color-state-error` (`#DC2626`)     | Badge error                            |
| `--color-state-deploying` (`#F59E0B`) | Badge deploying + spinner              |
| `--color-surface`                     | Fondo de tarjetas                      |
| `--color-border`                      | Borde de tarjetas y separadores        |
| `--font-display` (Space Grotesk)      | Nombre de cliente, título de sección   |
| `--font-body` (JetBrains Mono)        | Nombre de proyecto, dominio, timestamp |
| `--radius-md` (3px)                   | Border-radius de tarjetas y badges     |

---

## Flujo de datos

### Fase actual (datos ficticios)

```
mock-data.ts → (panel)/page.tsx → StatsBar + ClientSection[] → ProjectCard[]
```

### Producción (cuando se conecte tRPC)

Solo cambia `page.tsx`. El árbol de componentes no se modifica:

```ts
// Ahora:
import { clientes } from "@/lib/mock-data";

// Producción:
const clientes = await trpc.proyectos.listar();
```

---

## Estrategia de testing (regla 100/80/0)

| Componente      | Tier           | Cobertura objetivo | Qué se testea                                              |
| --------------- | -------------- | ------------------ | ---------------------------------------------------------- |
| `mock-data.ts`  | Infrastructure | 0%                 | —                                                          |
| `StatsBar`      | Important      | 80%                | Cuenta correctamente los estados de los proyectos          |
| `ClientSection` | Important      | 80%                | Renderiza el número correcto de tarjetas                   |
| `ProjectCard`   | Important      | 80%                | Botones correctos según estado; deshabilitado en deploying |
| `StatusBadge`   | Important      | 80%                | Badge correcto para cada uno de los 4 estados              |
| `Sidebar`       | Important      | 80%                | Ítem activo resaltado según ruta actual                    |

Herramienta: Vitest + Testing Library. Los tests verifican comportamiento observable desde el exterior del componente, sin inspeccionar implementación interna.

---

## Lo que queda fuera de este spec

- Auth / protección de rutas (prerequisito para producción, no para validación UI)
- Schema Prisma y migraciones
- tRPC router `proyectos.listar`
- Integración con dockerode para estado real de contenedores
- Acciones reales (start/stop/deploy) — los botones son stubs con `console.log` de momento
