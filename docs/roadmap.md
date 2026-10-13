# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Bugs conocidos

- **`/api/*` redirige al login en `next dev`** — solo en desarrollo (Turbopack); con `next start` las rutas `/api` responden bien. Sospecha: conviven `middleware.ts` (raíz, NextAuth) y `src/proxy.ts` (CORS + rate limit), y Next 16 espera un único `src/proxy.ts`. Impide probar en local el log de deploy en vivo (SSE) y el webhook. Propuesta: unificar ambos en `src/proxy.ts`.

---

## Backlog

### Features

- **`GIT_SHA_SHORT` en proyectos Node.js** — hoy solo se inyecta en compose desde repo y dockerfile.

- **Estado del Proxy (Traefik) en el Dashboard** — el health check solo comprueba BD y Docker daemon.

- **Secciones Clientes y Proxy en Configuración** — aparecían en el mockup; todavía no hay pantallas detrás.

### Técnico / Refactor

- **Logs del contenedor en pestaña propia** — hoy se abren en el modal (`LogsModal`) desde la cabecera del detalle; extraer el visor para poder incrustarlo.

---

## Hecho (antes en este backlog)

- Cancelar deploy + timeout configurable + cierre de deploys huérfanos al arrancar (`feature/cancelar-deploy`) · Reiniciar ya usa `docker restart` · Gestión de usuarios (PR #20) · Logs de deploy en tiempo real (PR #19; visibles en el detalle desde PR #34) · Volúmenes + gestor de ficheros (PR #21) · Import masivo de variables (PR #17) · Vista de logs más grande (modal 80vw, PR #23) · Variables que no llegaban al contenedor (resuelto en los hotfix de variables y compose-env).

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
