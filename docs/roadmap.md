# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Siguiente sesión (acordado el 14/10/2026)

1. **Cerrar la release 2.1.0** — mergear el PR #43 (`develop` → `master`); después, tag `v2.1.0` sobre el commit de merge en `master` y Release de GitHub con la sección `2.1.0` de `CHANGELOG.md` (líneas partidas unidas en una sola: GitHub muestra cada salto de línea) más un bloque «Al actualizar» (migración automática, `SENTRY_DSN` opcional, Node 22 en el próximo deploy).
2. **Decidir:** tag y Release retroactivos `v2.0.1` sobre `54834b0` (merge del hotfix #40 en `master`), para que GitHub coincida con la página Novedades.
3. **Releases automáticas** y **Dependabot** (ver Técnico).
4. **Diseñar los backups** con el usuario como base de la v2.2, junto con los tests E2E.

---

## Bugs conocidos

- **Deploy desde Node en Windows (solo desarrollo)** — `docker compose up --build` lanzado desde el panel falla en «failed to execute bake» (también con el código anterior a v2.1; desde la shell funciona), y cancelar solo mata `docker.exe`: el hijo `docker-compose.exe` termina el build. En la VPS (Linux) ambos funcionan.

---

## Backlog

### Features

- **Backups (siguiente prioridad tras v2.1)** — hoy no hay ninguna copia: ni de la BD del panel (proyectos, variables cifradas, credenciales SSH) ni de los volúmenes de los clientes. `pg_dump` programado + volúmenes, con retención y envío fuera de la VPS. Decidir antes qué se guarda, dónde y cada cuánto.
- **Secciones Clientes y Proxy en Configuración** — aparecían en el mockup; todavía no hay pantallas detrás.
- **Documentación OpenAPI** — ver «Decisiones pendientes» en `docs/notas-pendientes.md` (alcance: solo REST o también tRPC).

### Técnico / Refactor

- **Releases automáticas** — workflow que, al subir un tag `vX.Y.Z`, cree la Release de GitHub con la sección de esa versión de `CHANGELOG.md`. El proceso queda en: changelog → `npm version` → tag.
- **Dependabot** — no hay nada que avise de dependencias desactualizadas o vulnerables aparte del `npm audit` del CI. Configurar para npm, Docker y GitHub Actions.
- **Tests E2E** — `CLAUDE.md` habla de Playwright + axe-core, pero no hay configuración, ni tests, ni la dependencia. Base mínima: login, Dashboard, detalle de proyecto, cancelar deploy, Novedades.

---

## Hecho (antes en este backlog)

- **v2.1.0** (ver `CHANGELOG.md`): Node 22 y `.dockerignore` en Dockerfiles generados · Sentry en servidor · CI en ramas feature/hotfix/release · código SSL sin uso eliminado · Telegram distingue cancelado · historial de versiones en Novedades · `GIT_SHA_SHORT` en proyectos Node.js · Logs del contenedor en pestaña propia (`VisorLogs`, compartido con el modal) · Proxy único `src/proxy.ts` (`/api/*` ya no redirige al login en `next dev`) y límite de 10 intentos/min por IP en el login · Logs SSE sin contenedores · Estado de Traefik y certificados en el health check y el Dashboard · Cancelar deploy + timeout configurable + cierre de deploys huérfanos al arrancar (`feature/cancelar-deploy`) · Reiniciar ya usa `docker restart` · Gestión de usuarios (PR #20) · Logs de deploy en tiempo real (PR #19; visibles en el detalle desde PR #34) · Volúmenes + gestor de ficheros (PR #21) · Import masivo de variables (PR #17) · Vista de logs más grande (modal 80vw, PR #23) · Variables que no llegaban al contenedor (resuelto en los hotfix de variables y compose-env).

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
