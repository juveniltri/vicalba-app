# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Siguiente sesión

Hecho el 14/10/2026: release **2.1.0** (tag `v2.1.0` sobre `755ec6c`, Release de GitHub marcada como última) y release retroactiva **2.0.1** (tag `v2.0.1` sobre `54834b0`, el merge del hotfix #40).

Si un tag apunta a un commit antiguo, crearlo con `git tag <tag> <sha>` + `git push origin <tag>`: el workflow crea la Release sin marcarla como última.

### 2.1.1 — `release/2.1.1`, PR #46

Hecho:

- [x] Notificaciones a Discord (embed) y Slack (`{ text }`), con el motivo del rechazo en el error.
- [x] `.gitattributes` con LF en todo el repo.
- [x] Dependabot (npm, Actions, Docker; PRs semanales contra `develop`).
- [x] Release de GitHub automática al subir un tag (`.github/workflows/release.yml`).

Hecho tras la revisión del 14/10/2026:

- [x] **Sesiones que sobreviven al usuario (seguridad)** — la sesión es un JWT de 30 días que nunca se contrasta con la BD: un usuario borrado o con la contraseña cambiada sigue entrando hasta que caduca. Comprobar en cada petición que el usuario existe y que el token es posterior al último cambio de contraseña; `maxAge` más corto.
- [x] **Rotación de logs de contenedores** — ni los composes generados ni el daemon limitan los logs de Docker; un contenedor ruidoso llena el disco de la VPS. `logging` con `max-size`/`max-file` en los composes generados + `daemon.json` documentado para los compose desde repo.
- [x] **Limpieza de imágenes tras el deploy** — cada build deja imágenes y caché de build; no hay ningún `prune`. Limpiar tras un deploy correcto sin romper el rollback.
- [x] **Prisma alineado** — CLI 7.10 y `@prisma/client` 7.8.
- [x] **Dependencias menores al día** (tRPC, Zod, Sentry, nodemailer, dockerode, pg, pino, Tailwind). Vitest 4.1.11 (`npm audit`: `@vitest/mocker`, moderado, solo desarrollo) queda para Dependabot: npm en Windows falla con «edgesOut» al resolver el peer opcional `canvas` de jsdom.
- [x] **Healthcheck del contenedor del panel** en `docker-compose.yml` sobre `/api/health`.
- [x] **CLAUDE.md al día** — dice Next.js 15 (es 16) y `main` (es `master`).

Tras el merge: tag `v2.1.1` (primera Release automática) y merge de `master` a `develop` (cierra el #45).

### 2.2.0

- [x] **Backups — fase A** — BD del Panel y config de Traefik a S3/SFTP con restic, copia diaria, restauración desde el Panel y recuperación sin VPS (`docs/recuperacion.md`).
- [ ] **Backups — fase B (volúmenes)** de los Proyectos.
- [ ] **Backups — fase C (BDs de Clientes)**: detección, dump lógico y restauración.
- [ ] **Tests E2E** (ver Técnico).
- [ ] **Alerta de disco** — las métricas de la VPS ya existen; avisar por los canales de notificación al pasar del 85 %.
- [ ] **CSP estricta** — hoy permite `'unsafe-eval'` y `'unsafe-inline'` en scripts. Ver qué lo exige (Monaco, script anti-FOUC) y pasar a nonces.
- [ ] **Cobertura según la regla 100/80** — los umbrales de `vitest.config.ts` son una lista de ficheros; `src/lib/sesion.ts` y `src/lib/compose` (93 % de ramas por `puertoContenedorDe`) no están. Completar tests y añadirlos.
- [ ] **Scripts muertos** — `test:integration` apunta a un `vitest.integration.config.ts` que no existe y `test:e2e` a Playwright, sin instalar. Se resuelve con los E2E.
- [ ] **Fuentes locales** — `next/font/google` descarga las fuentes en cada build; si Google falla, falla el build (pasó en el CI del #47) y también el de la imagen en la VPS. Pasar a `next/font/local`.

### Más adelante

- [ ] **Registro de actividad** — quién lanzó un deploy/rollback, borró o editó un proyecto o cambió variables (hoy solo `Deploy.origen`).
- [ ] **2FA (TOTP)** en el login.
- [ ] **Backups — más adelante**: cambiar la clave de cifrado, varios destinos a la vez, retención configurable y `restic check` periódico.
- [ ] **Versiones mayores** en una rama propia: TypeScript 7, ESLint 10, Vitest 5, commitlint 21, jsdom 30.

---

## Bugs conocidos

- **Deploy desde Node en Windows (solo desarrollo)** — `docker compose up --build` lanzado desde el panel falla en «failed to execute bake» (también con el código anterior a v2.1; desde la shell funciona), y cancelar solo mata `docker.exe`: el hijo `docker-compose.exe` termina el build. En la VPS (Linux) ambos funcionan.

---

## Backlog

### Features

- **Backups (v2.2)** — hoy no hay ninguna copia: ni de la BD del panel (proyectos, variables cifradas, credenciales SSH) ni de los volúmenes de los clientes. `pg_dump` programado + volúmenes, con retención y envío fuera de la VPS. Decidir antes qué se guarda, dónde y cada cuánto.
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
