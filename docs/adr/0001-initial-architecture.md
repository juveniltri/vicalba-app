# ADR-0001 — Arquitectura inicial del proyecto

**Estado:** Aceptada
**Fecha:** 2026-06-04
**Autores:** Victor Ramos

---

## Contexto

Panel de gestión de infraestructura para uso interno de 2 personas técnicas. Gestiona una única VPS con proyectos Docker de múltiples clientes, aislados en redes separadas. Requisitos clave: control del daemon Docker desde la app, proxy inverso dinámico con SSL, webhooks de GitHub para auto-deploy y logs en tiempo real. El propio panel corre como un contenedor en la VPS que gestiona.

Restricciones: equipo de 2 personas, proyecto interno sin presupuesto externo, necesidad de iterar rápido en el MVP.

---

## Opciones consideradas

### Opción A — Next.js 15 + tRPC + PostgreSQL + dockerode + Traefik

**Pros:**
- Un solo repositorio y lenguaje (TypeScript full-stack)
- tRPC elimina la necesidad de mantener contratos de API manuales
- Prisma facilita las migraciones y el tipado de la DB
- Traefik es la solución estándar de proxy en ecosistemas Docker (la usa Coolify)
- dockerode es la librería Node.js oficial para el Docker Engine API
- Next.js App Router permite Server Components y SSE nativos

**Contras:**
- Next.js añade overhead de build si solo se necesita un backend ligero
- dockerode requiere acceso al socket Docker — implica montarlo como volumen

### Opción B — NestJS + React (Vite) + PostgreSQL

**Pros:** Mejor separación frontend/backend, más testable con decoradores DI

**Contras:** Dos repos o monorepo más complejo, más boilerplate, menor velocidad inicial de desarrollo para un equipo de 2

### Opción C — Coolify self-hosted + personalización

**Pros:** Funcionalidad ya construida

**Contras:** No da control total, no se puede iterar a medida, dependencia de proyecto externo

---

## Decisión

Elegimos **Opción A** porque maximiza la velocidad de desarrollo con un equipo pequeño, mantiene todo en TypeScript tipado end-to-end y Traefik + dockerode son exactamente las herramientas que necesitamos para las funcionalidades core.

---

## Consecuencias

### Positivas

- TypeScript end-to-end: errores detectados en compilación, no en runtime
- tRPC: cambios de API se propagan automáticamente al cliente
- Traefik: SSL y routing dinámico sin configuración manual por cada proyecto
- Un solo repo, un solo `npm install`, CI sencillo

### Negativas / trade-offs asumidos

- El panel necesita acceso al socket Docker (`/var/run/docker.sock`) — superficie de ataque a gestionar con cuidado
- Next.js no es ideal para heavy backend async work (deploys largos) — los jobs de deploy deben correr en background y comunicarse vía SSE o polling
- Si el panel cae, la gestión de infraestructura se hace por SSH directamente

### Riesgos

- El acceso al socket Docker otorga privilegios de root efectivo al contenedor del panel — mitigar con red interna y auth estricta
- Traefik y el panel comparten la VPS: si la VPS cae, todo cae — no hay redundancia en MVP

---

## Notas de revisión

Revisar si escalar a múltiples VPS en Fase 2 requiere extraer la capa de comunicación Docker a un agente separado por VPS.
