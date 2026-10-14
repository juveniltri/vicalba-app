# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Siguiente sesión

Hecho el 14/10/2026: release **2.1.0** (tag `v2.1.0` sobre `755ec6c`, Release de GitHub marcada como última) y release retroactiva **2.0.1** (tag `v2.0.1` sobre `54834b0`, el merge del hotfix #40).

En la **2.1.1** (`release/2.1.1`): notificaciones a Discord y Slack con su formato, `.gitattributes` con LF en todo el repo, Dependabot (npm, Actions, Docker; PRs semanales contra `develop`) y Releases automáticas al subir un tag (`.github/workflows/release.yml`, ver «Versiones y changelog» en `CLAUDE.md`).

Pendiente:

1. **Diseñar los backups** como base de la v2.2, junto con los tests E2E.
2. Revisar los primeros PRs de Dependabot (el lunes): los menores de npm llegan agrupados en uno.

Si un tag apunta a un commit antiguo, crearlo con `git tag <tag> <sha>` + `git push origin <tag>`: el workflow crea la Release sin marcarla como última.

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

- **Tests E2E** — `CLAUDE.md` habla de Playwright + axe-core, pero no hay configuración, ni tests, ni la dependencia. Base mínima: login, Dashboard, detalle de proyecto, cancelar deploy, Novedades.

---

## Hecho (antes en este backlog)

- **v2.1.0** (ver `CHANGELOG.md`): Node 22 y `.dockerignore` en Dockerfiles generados · Sentry en servidor · CI en ramas feature/hotfix/release · código SSL sin uso eliminado · Telegram distingue cancelado · historial de versiones en Novedades · `GIT_SHA_SHORT` en proyectos Node.js · Logs del contenedor en pestaña propia (`VisorLogs`, compartido con el modal) · Proxy único `src/proxy.ts` (`/api/*` ya no redirige al login en `next dev`) y límite de 10 intentos/min por IP en el login · Logs SSE sin contenedores · Estado de Traefik y certificados en el health check y el Dashboard · Cancelar deploy + timeout configurable + cierre de deploys huérfanos al arrancar (`feature/cancelar-deploy`) · Reiniciar ya usa `docker restart` · Gestión de usuarios (PR #20) · Logs de deploy en tiempo real (PR #19; visibles en el detalle desde PR #34) · Volúmenes + gestor de ficheros (PR #21) · Import masivo de variables (PR #17) · Vista de logs más grande (modal 80vw, PR #23) · Variables que no llegaban al contenedor (resuelto en los hotfix de variables y compose-env).

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
