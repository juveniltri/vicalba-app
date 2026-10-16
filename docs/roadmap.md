# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Siguiente sesión

Publicadas: **2.2.0** (14/10/2026, backups fase A y guía de usuario), 2.1.1, 2.1.0 y 2.0.1.
Si un tag apunta a un commit antiguo, crearlo con `git tag <tag> <sha>` + `git push origin <tag>`: el workflow crea la Release sin marcarla como última.

`develop` y `master` están protegidas (PR y los 7 checks de CI); `gh pr merge <n> --auto --merge` mergea al pasar la CI y GitHub borra la rama al mergear.

Publicada la **2.3.0** (16/10/2026, Proxy y servicios). Ahora: desplegarla en la VPS de desarrollo y después en
producción con `production.md` § B3 (y § B4 si falta la 2.2.0); a partir del 18/10/2026, cuando Cloudflare dé acceso,
verificar el modo Cloudflare en la VPS de desarrollo con `production.md` § C. Si falla algo: hotfix 2.3.1 desde `master`.
Después, la 2.4.0 (empezar por las fuentes locales: el build falla a veces al descargar las de Google).

### 2.2.0 — backups, fase A (PR #56) y guía de usuario (PR #57) — publicada

- [x] **Backups — fase A** — BD del Panel y config de Traefik a S3/SFTP con restic, copia diaria, restauración desde el Panel y recuperación sin VPS (`docs/recuperacion.md`). Verificada en real: S3 (SeaweedFS), SFTP, destino caído, reinicio a mitad de copia, restauración y simulacro de recuperación.
- [x] **Guía de usuario** — página «Guía» y PDF con capturas regenerables (`npm run guia`); de paso, arreglados los filtros por nivel de los logs y el estado de certificados en instalaciones nuevas.

### 2.3.0 — Proxy y servicios (`feature/2.3.0`, diseño en `docs/diseno-proxy.md`)

- [x] **Acciones por Servicio** — iniciar, detener y reiniciar un Servicio del compose; tarjeta «Servicios» con su estado. Verificado contra Docker real.
- [x] **Rutas múltiples** — varios dominios/paths por Proyecto, cada uno a un Servicio y puerto; pestaña Dominios con el YAML generado; corrige la colisión de `dynamic/<nombre>.yml` entre Clientes. Verificado el 16/10/2026: migración en Postgres 16 (sin desfase con el schema), rutas/PathPrefix/alias/redirección www con Traefik v3 real y flujo crear/duplicado/borrar en el Panel.
- [x] **Arreglos previos detectados** — los Proyectos `image` ya se conectan a la red del Cliente; los composes generados ya no publican `puerto:puerto` en el host (solo `expose`). Para el `### Al actualizar` del CHANGELOG: tras redesplegar, los Proyectos dockerfile/nodejs/image dejan de responder en `IP:puerto`; solo por sus dominios.
- [x] **Middlewares por ruta** — auth básica (bcrypt $2y$ coste 5, hashes nunca salen del servidor), IPs permitidas, límite de peticiones, body máximo, cabeceras, compresión, quitar prefijo y copiar de otra ruta. Verificado con Traefik v3.
- [x] **Proxy editable** — Configuración → Proxy: IPs de confianza, timeouts, TLS mínimo, log y access log; aplicar en segundo plano con vuelta atrás automática; acceso de emergencia por `127.0.0.1:3000`; Traefik fijado a v3.7.15. Verificado con el stack de producción (`npm run guia`): arranque desde cero, aplicar, TLS 1.2 rechazado con mínimo 1.3 y recuperación de un `traefik.yml` roto entrando por el acceso de emergencia. De paso: `ACME_EMAIL` nunca llegaba a Traefik (ignoraba los flags de CLI) y sin su fichero arranca en silencio con la config por defecto.
- [ ] **Cloudflare: Authenticated Origin Pulls** — confiar en los rangos de Cloudflare no distingue nuestro tráfico del de otras cuentas de Cloudflare (Workers incluidos). Exigir el certificado de cliente de Cloudflare en las rutas «Detrás de Cloudflare» (`tls.options` con `clientAuth`) cierra el origen. Señalado en el `/security-review` de la 2.3.0 (confianza baja).
- [ ] **Visor de logs de Traefik en vivo** (SSE) en Configuración → Proxy; hoy solo las últimas 30 líneas.
- [x] **Modo Cloudflare** — rangos de Cloudflare en `trustedIPs` (editables y actualizables), token cifrado y resolver DNS-01 (`CF_DNS_API_TOKEN_FILE`), HTTP-01 sin token, casilla por ruta e IP real en los middlewares (`ipStrategy.excludedIPs`). Verificado con Traefik v3 y un Cloudflare simulado (incluida la falsificación de `X-Forwarded-For`). **Falta en la VPS de desarrollo**: certificado real por DNS-01 con el token y por HTTP-01 a través del proxy naranja.

### 2.4.0

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
