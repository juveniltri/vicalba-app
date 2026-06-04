# Labels de Triage — vicalba-app

## Tipo

| Label | Color | Uso |
|---|---|---|
| `feat` | `#0075ca` | Nueva funcionalidad |
| `fix` | `#d73a4a` | Corrección de bug |
| `chore` | `#e4e669` | Mantenimiento, dependencias, config |
| `docs` | `#0075ca` | Documentación |
| `refactor` | `#cfd3d7` | Refactor sin cambio de comportamiento |
| `test` | `#bfd4f2` | Tests nuevos o corregidos |
| `perf` | `#0075ca` | Mejora de rendimiento |
| `security` | `#b60205` | Vulnerabilidad o mejora de seguridad |

## Prioridad

| Label | Color | Criterio |
|---|---|---|
| `P0 — crítico` | `#b60205` | Producción caída o datos en riesgo |
| `P1 — alto` | `#e11d48` | Bloquea una funcionalidad core del MVP |
| `P2 — medio` | `#f59e0b` | Importante pero tiene workaround |
| `P3 — bajo` | `#6b7280` | Nice-to-have, no bloquea release |

## Área

| Label | Uso |
|---|---|
| `area: docker` | Issues relacionados con dockerode o Docker Compose |
| `area: traefik` | Proxy inverso, routing, SSL |
| `area: auth` | Autenticación y sesiones |
| `area: webhooks` | Integración con GitHub webhooks |
| `area: ui` | Componentes y pages de Next.js |
| `area: db` | Prisma, migraciones, queries |
| `area: ci` | GitHub Actions, pipeline |

## Estado especial

| Label | Uso |
|---|---|
| `blocked` | Esperando dependencia externa |
| `needs-design` | Requiere decisión de diseño antes de implementar |
| `needs-adr` | Requiere ADR antes de implementar |
| `good first issue` | Buen punto de entrada para el proyecto |
