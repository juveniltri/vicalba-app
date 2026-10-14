# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Siguiente sesión

Publicadas: **2.1.1** (14/10/2026, tag `v2.1.1`, primera Release automática), 2.1.0 y 2.0.1.
Si un tag apunta a un commit antiguo, crearlo con `git tag <tag> <sha>` + `git push origin <tag>`: el workflow crea la Release sin marcarla como última.

Ahora: PR #56 (`feature/v2.2` → `develop`, backups fase A) y después `release/2.2.0` → `master`
(fecha en `CHANGELOG.md`, `npm version 2.2.0 --no-git-tag-version`, tag `v2.2.0`).

### 2.2.0 — backups, fase A (PR #56) y guía de usuario

- [x] **Backups — fase A** — BD del Panel y config de Traefik a S3/SFTP con restic, copia diaria, restauración desde el Panel y recuperación sin VPS (`docs/recuperacion.md`). Verificada en real: S3 (SeaweedFS), SFTP, destino caído, reinicio a mitad de copia, restauración y simulacro de recuperación.
- [x] **Guía de usuario** — página «Guía» y PDF con capturas regenerables (`npm run guia`); de paso, arreglados los filtros por nivel de los logs y el estado de certificados en instalaciones nuevas.

### 2.3.0

- [ ] **Backups — fase B (volúmenes)** de los Proyectos.
- [ ] **Backups — fase C (BDs de Clientes)**: detección, dump lógico y restauración.
- [ ] **Backups — pendientes de la fase A** (menores de la revisión y de la verificación real):
  - al restaurar Traefik se borra `dynamic/` antes de copiar (hueco breve de rutas; si falta el origen, queda vacía);
  - host y usuario SFTP admiten un `-` inicial (opciones de `ssh`; sin ejecución de código);
  - el interruptor y la hora de la programación no se resincronizan tras refrescar, y la hora no se bloquea mientras se guarda;
  - sin destino configurado, «Copias disponibles» muestra el aviso en rojo;
  - la primera comprobación del programador es a los 60 s del arranque;
  - no se impide borrar una credencial SSH en uso por los backups (la copia queda en error y avisa);
  - si el destino cae a mitad de una copia (tras la comprobación inicial), restic reintenta hasta ~15 min.
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

- **Secciones Clientes y Proxy en Configuración** — aparecían en el mockup; todavía no hay pantallas detrás.
- **Documentación OpenAPI** — ver «Decisiones pendientes» en `docs/notas-pendientes.md` (alcance: solo REST o también tRPC).

### Técnico / Refactor

- **Tests E2E** — `CLAUDE.md` habla de Playwright + axe-core, pero no hay configuración, ni tests, ni la dependencia. Base mínima: login, Dashboard, detalle de proyecto, cancelar deploy, Novedades.

---

## Hecho (antes en este backlog)

- **v2.2.0** (ver `CHANGELOG.md`): backups fase A — copia diaria cifrada de la BD del Panel y de Traefik a S3/SFTP con restic, restauración desde el Panel, kit de recuperación y `docs/recuperacion.md`.
- **v2.1.1** (ver `CHANGELOG.md`): Discord/Slack · sesiones invalidadas al borrar usuario o cambiar contraseña · logs de contenedores limitados · limpieza de imágenes tras deploy · Prisma 7.10 · healthcheck del panel · `.gitattributes` · Dependabot · Release automática al subir un tag.
- **v2.1.0** (ver `CHANGELOG.md`): Node 22 y `.dockerignore` en Dockerfiles generados · Sentry en servidor · CI en ramas feature/hotfix/release · código SSL sin uso eliminado · Telegram distingue cancelado · historial de versiones en Novedades · `GIT_SHA_SHORT` en proyectos Node.js · Logs del contenedor en pestaña propia (`VisorLogs`, compartido con el modal) · Proxy único `src/proxy.ts` (`/api/*` ya no redirige al login en `next dev`) y límite de 10 intentos/min por IP en el login · Logs SSE sin contenedores · Estado de Traefik y certificados en el health check y el Dashboard · Cancelar deploy + timeout configurable + cierre de deploys huérfanos al arrancar (`feature/cancelar-deploy`) · Reiniciar ya usa `docker restart` · Gestión de usuarios (PR #20) · Logs de deploy en tiempo real (PR #19; visibles en el detalle desde PR #34) · Volúmenes + gestor de ficheros (PR #21) · Import masivo de variables (PR #17) · Vista de logs más grande (modal 80vw, PR #23) · Variables que no llegaban al contenedor (resuelto en los hotfix de variables y compose-env).

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
