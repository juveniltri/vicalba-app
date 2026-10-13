# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## En curso — v2.1 (`feature/v2.1`)

Acordado el 14/10/2026; se cierra con PR `feature/v2.1` → `develop`.

- [x] **Node 22 en los Dockerfiles generados** — `deploy.ts` usa `node:20-alpine` y Node 20 está fuera de soporte desde abril de 2026 (sin parches de seguridad). El panel ya usa Node 22.
- [ ] **Sentry conectado de verdad** — `@sentry/nextjs` está instalado y existe `src/lib/sentry.ts`, pero nadie lo importa: los errores de producción no llegan a ningún sitio. Además hay `console.*` donde debería ir Pino.
- [ ] **`.dockerignore` generado** — el Dockerfile generado hace `COPY . .` sin `.dockerignore`, así que la imagen final de nodejs/dockerfile incluye `.git` con todo el historial del repo.
- [ ] **CI en ramas `feature/**`** — el workflow solo corre en push a `develop`/`master` y en PRs.
- [ ] **Quitar código sin uso** — procedure `proyectos.estadoSSL` y `leerEstadoSSL`.
- [ ] **Telegram distingue cancelado** — un deploy cancelado por timeout sale con ❌ como un error.

---

## Bugs conocidos

- **Deploy desde Node en Windows (solo desarrollo)** — `docker compose up --build` lanzado desde el panel falla en «failed to execute bake» (también con el código anterior a v2.1; desde la shell funciona), y cancelar solo mata `docker.exe`: el hijo `docker-compose.exe` termina el build. En la VPS (Linux) ambos funcionan.

---

## Backlog

### Features

- **Backups (siguiente prioridad tras v2.1)** — hoy no hay ninguna copia: ni de la BD del panel (proyectos, variables cifradas, credenciales SSH) ni de los volúmenes de los clientes. `pg_dump` programado + volúmenes, con retención y envío fuera de la VPS. Decidir antes qué se guarda, dónde y cada cuánto.
- **Secciones Clientes y Proxy en Configuración** — aparecían en el mockup; todavía no hay pantallas detrás.
- **Documentación OpenAPI** — ver «Decisiones pendientes» en `docs/notas-pendientes.md` (alcance: solo REST o también tRPC).

---

## Hecho (antes en este backlog)

- `GIT_SHA_SHORT` en proyectos Node.js · Logs del contenedor en pestaña propia (`VisorLogs`, compartido con el modal) · Proxy único `src/proxy.ts` (`/api/*` ya no redirige al login en `next dev`) y límite de 10 intentos/min por IP en el login · Logs SSE sin contenedores · Estado de Traefik y certificados en el health check y el Dashboard · Cancelar deploy + timeout configurable + cierre de deploys huérfanos al arrancar (`feature/cancelar-deploy`) · Reiniciar ya usa `docker restart` · Gestión de usuarios (PR #20) · Logs de deploy en tiempo real (PR #19; visibles en el detalle desde PR #34) · Volúmenes + gestor de ficheros (PR #21) · Import masivo de variables (PR #17) · Vista de logs más grande (modal 80vw, PR #23) · Variables que no llegaban al contenedor (resuelto en los hotfix de variables y compose-env).

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
