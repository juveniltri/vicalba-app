# vicalba-app

## Qué es este proyecto

Panel de control de infraestructura al estilo Coolify/cPanel, diseñado para uso interno de un equipo técnico de 2 personas. Gestiona todos los proyectos Docker en una única VPS: proxy inverso Traefik, SSL automático con Let's Encrypt, deploys desde GitHub vía webhooks y logs en tiempo real. Cada cliente tiene sus servicios aislados en redes Docker dedicadas.

**Stack:** Next.js 16 (App Router) + TypeScript + tRPC + PostgreSQL + Prisma 7 + NextAuth v5 + dockerode + Traefik
**Hosting:** Contenedor Docker en la misma VPS que gestiona

---

## Workflow de desarrollo

### Ramas

```
master        → producción (tags: vX.X.X)
develop       → integración continua
feature/XXX   → funcionalidad nueva (desde develop)
hotfix/XXX    → fix urgente (desde master, PR directo a master + merge a develop)
release/X.X.X → preparación de release (desde develop; en una versión de parche, desde
                master para agrupar hotfix y mantenimiento en un solo PR a master)
```

**Regla:** nunca se hace commit directo a `master` ni a `develop`. Todo entra por PR.

### Commits — Conventional Commits

```
feat:      nueva funcionalidad
fix:       corrección de bug
refactor:  refactor sin cambio de comportamiento
test:      añadir o corregir tests
chore:     mantenimiento, dependencias, config
docs:      documentación
perf:      mejora de rendimiento
```

Breaking change: añade `!` después del tipo (`feat!:`) o `BREAKING CHANGE:` en el footer.

### Versiones y changelog

El panel muestra `CHANGELOG.md` en la página **Novedades** y avisa de la última versión en el
Dashboard (`src/lib/changelog.ts` lo interpreta). En cada release, antes del PR a `master`:

1. Añadir arriba la entrada `## [X.Y.Z] - AAAA-MM-DD` con un resumen de una línea y los apartados
   `### Novedades`, `### Correcciones`, `### Seguridad`. Redactada para quien usa el panel, no
   copiando commits (el borrador sale de `git log` de los `feat:`/`fix:` desde el último tag).
   Si actualizar exige algo (migración, variable nueva en `.env`), añadir `### Al actualizar`.
2. Subir la versión: `npm version X.Y.Z --no-git-tag-version` (package.json + lock).
3. Tras el merge a `master`, crear el tag `vX.Y.Z` sobre el merge y subirlo
   (`git tag vX.Y.Z && git push origin vX.Y.Z`). El workflow `release.yml` crea la Release
   de GitHub con esa sección del CHANGELOG (`scripts/notas-release.mjs`) y el PR del merge;
   falla si el tag no coincide con `package.json`.

El fichero entra en la imagen por la excepción `!CHANGELOG.md` de `.dockerignore` y su `COPY`
en el `Dockerfile`; si falta, Novedades sale vacía pero el panel funciona.

---

## Estrategia de testing — Regla 100/80/0

| Tier               | Carpetas                                         | Cobertura mínima     |
| ------------------ | ------------------------------------------------ | -------------------- |
| **Core**           | `src/server/routers/`, `src/lib/`, `src/domain/` | **100%**             |
| **Important**      | `src/components/`, `src/hooks/`, `src/utils/`    | **80%**              |
| **Infrastructure** | `src/config/`, `src/db/`, `src/lib/docker/`      | **0%** (no se testa) |

Esta regla es un gate hard en CI. Ver `docs/testing-strategy.md` para el mapa completo.

### Herramientas

- Unit / Integration: **Vitest**
- E2E: **Playwright**
- Accesibilidad: **axe-core** integrado en Playwright
- Observabilidad de errores: **Sentry**

### Flujo TDD

Usa `/tdd` para cualquier feature nueva o bug fix. Red → Green → Refactor siempre.

---

## Convenciones de código

### Estructura de carpetas

```
src/
  app/               ← Next.js App Router (páginas y layouts)
  components/        ← Componentes de UI
  server/
    routers/         ← tRPC routers
    db/              ← queries y schemas Prisma
  lib/
    docker/          ← integración con dockerode
    traefik/         ← generación de config dinámica Traefik
    schemas/         ← schemas Zod compartidos
  styles/
    tokens.css       ← design tokens (NO editar valores en componentes)
  env.ts             ← validación Zod de variables de entorno
```

### TypeScript

- Strict mode siempre activo — nunca deshabilitar reglas en `tsconfig`
- Prohibido `any` — usar `unknown` y narrowing
- **Zod obligatorio** para todo dato externo: variables de entorno, respuestas de API, inputs de formulario, webhooks de GitHub
- Path aliases configurados: `@/` apunta a `src/`

### Docker y Traefik

- Nunca llamar al socket Docker directamente desde un componente — siempre a través de `src/lib/docker/`
- La config dinámica de Traefik se genera programáticamente en `src/lib/traefik/` — no editar manualmente
- Las redes Docker de clientes siguen la convención `cliente-[slug]-network`

### Comentarios

No describas QUÉ hace el código — los nombres ya lo hacen. Solo escribe un comentario cuando el POR QUÉ no sea obvio.

```
TODO:  mejora conocida, no bloquea
FIXME: bug conocido, bloquea — resolver antes del próximo release
HACK:  workaround temporal — añade cuándo revisitar
NOTE:  contexto que sorprendería a un futuro lector
```

### Ficheros

- Nunca crear ficheros nuevos sin preguntar primero
- Preferir editar existentes sobre crear nuevos
- No añadir comentarios explicando el commit o la tarea actual

---

## Seguridad

### Baseline

- `npm audit` debe pasar a `--audit-level=high` antes de cualquier deploy a producción
- Secrets nunca en el repositorio — el pre-commit hook lo bloquea
- HTTPS siempre — Traefik redirige HTTP a HTTPS en todos los entornos excepto local
- Variables de entorno validadas con Zod en `src/env.ts` al arrancar la aplicación
- El socket Docker (`/var/run/docker.sock`) solo es accesible desde dentro del contenedor del panel

### Módulo auth

- SQL: nunca construir queries con concatenación de strings — Prisma con queries parametrizadas siempre
- Inputs: sanitizar y validar TODA entrada del usuario en el boundary del servidor (Zod)
- Cookies y tokens: `HttpOnly`, `Secure`, `SameSite=Strict`
- Variables sensibles: nunca en `NEXT_PUBLIC_*`
- CSRF: tokens en todas las operaciones que muten estado
- Headers HTTP obligatorios: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- CSP: definida y activa en producción
- TLS: mínimo TLS 1.2 — Traefik gestiona la negociación
- Webhook secret de GitHub: validar HMAC-SHA256 en cada petición entrante
- Sesión: JWT de 7 días validado contra la BD en cada `auth()` (`sesionVigente`, `src/lib/sesion.ts`): un usuario eliminado o con la contraseña cambiada (`User.sesionesDesde`) pierde la sesión al momento

Antes de cada merge a `master`: invoca `/security-review`.

---

## Observabilidad

- **Sentry:** solo servidor y solo si `SENTRY_DSN` está definido (`.env` de la VPS; vacío = desactivado). `src/instrumentation.ts` lo inicializa y exporta `onRequestError` (páginas, rutas API, server actions); la ruta de tRPC envía los `INTERNAL_SERVER_ERROR` desde su `onError`, y `lanzarDeploy` las excepciones inesperadas del deploy en segundo plano. Sin source maps subidos.
- **Pino:** logging estructurado en JSON. Cada log con `level`, `msg`, `context` y `traceId`.
- **Health check:** `GET /api/health` devuelve estado de DB, Docker daemon, Traefik (contenedor running) y certificados (`acme.json` legible), y versión del deploy; 503 si alguno falla. El healthcheck del contenedor en `docker-compose.yml` solo comprueba que responde (cualquier código): Traefik no enruta a un contenedor unhealthy.
- **Logs de contenedor:** streaming vía SSE desde `GET /api/projects/[id]/logs` — nunca almacenar logs de contenedor en BD.
- **Backups:** `src/lib/backups/` con restic (etiqueta `panel`, host `vicalba-panel`); programador en `src/instrumentation.ts` (comprobación cada minuto, estado en BD; al arrancar cierra las operaciones `en_curso` huérfanas); `/api/health` no los incluye a propósito (un 503 haría que Traefik dejara de enrutar el Panel).

---

## Scripts npm

```bash
npm run dev              # servidor de desarrollo
npm run build            # build de producción
npm run lint             # eslint
npm run type-check       # tsc --noEmit
npm run test:unit        # vitest (unitarios)
npm run test:integration # vitest (integración)
npm run test:e2e         # playwright
npm run db:migrate       # ejecutar migraciones pendientes
npm run db:seed          # poblar con datos de desarrollo
npm run db:reset         # reset + migrate + seed
```

---

## Despliegue en producción (VPS)

### Requisitos previos en la VPS

```bash
# Crear directorios persistentes
mkdir -p /var/vicalba/traefik/dynamic /var/vicalba/repos

# Apuntar el DNS del dominio del panel a la IP de la VPS antes de arrancar
```

Los certificados de Let's Encrypt los guarda Traefik en el volumen Docker con
nombre `letsencrypt` (ver `storage` en `traefik/traefik.yml`), no en un fichero
bind-mounted — Docker lo crea solo al arrancar. Traefik fuerza permisos 600 en
ese fichero (propiedad de su propio usuario), así que el panel —que corre como
usuario no-root— no puede leerlo aunque comparta el volumen. Por eso
`leerCertificados` no lee el fichero directamente: usa `leerFicheroTraefik`
(`src/lib/docker/traefik.ts`), que hace `docker exec cat <ruta>` en el propio
contenedor Traefik vía el socket Docker que el panel ya tiene montado.
`ACME_JSON_PATH` (por defecto `/letsencrypt/acme.json`) es la ruta _dentro_
del contenedor Traefik, debe coincidir con `storage` en `traefik/traefik.yml`.

### Primera vez

```bash
git clone <repo> vicalba-app && cd vicalba-app
cp .env.production.example .env
# Editar .env con los valores reales
docker compose up -d --build
```

### Actualizaciones

```bash
git pull
docker compose up -d --build panel
```

### Desarrollo local

```bash
./scripts/dev.sh start   # levanta PostgreSQL, migra, siembra y arranca el servidor
./scripts/dev.sh stop    # para PostgreSQL
./scripts/dev.sh reset   # recrea la BD desde cero
./scripts/dev.sh status  # estado de los servicios
```

El script crea `.env.local` automáticamente con secretos generados si no existe,
detecta el socket Docker en macOS/Linux y crea los directorios necesarios en `/tmp/vicalba/`.
Credenciales del seed: `admin@vicalba.local` / `dev-password-2026`

### Nota — redes de clientes y Traefik

La conexión de Traefik a las redes de cliente es **automática** desde la feature Gestión de Dominios.
Al crear/editar/eliminar un proyecto con dominio, el panel llama a `conectarTraefikARed` /
`desconectarTraefikDeRed` via dockerode. Variable de entorno relevante: `TRAEFIK_CONTAINER_NAME`
(default: `traefik`). Solo hace falta intervención manual en instalaciones con un nombre distinto.

### Nota — variables que inyecta el panel en el build

En cada deploy desde repositorio el panel añade **`GIT_SHA_SHORT`** (los 7 primeros caracteres del
commit desplegado) a las variables build-time; si el usuario define una con ese nombre, gana la del panel.

- **Compose desde repo:** las build-time y `GIT_SHA_SHORT` se escriben en `<repo>/.env` antes del
  `up --build` y, al terminar (éxito o error), el `.env` vuelve a contener solo las runtime.
  El proyecto las mapea en su compose, p. ej. `args: { CRM_BUILD: ${GIT_SHA_SHORT} }`.
- **Dockerfile:** van como `build.args` en el compose generado.
- **Node.js:** las build-time y `GIT_SHA_SHORT` van a `.env.local` del stage builder; el Dockerfile multi-stage lo borra antes del stage final.

### Nota — espacio en disco

Cada contenedor guarda como máximo 3 ficheros de log de 10 MB (`LIMITE_LOGS` en `src/lib/compose`):
los composes generados lo llevan escrito y los compose del usuario reciben un segundo `-f` con
`<proyecto>.logging.yml` para los servicios sin `logging` propio. Tras cada deploy correcto se
borran las imágenes colgantes y la caché de build sin usar en 7 días (`limpiarDisco`); el rollback
reconstruye desde el commit, así que no las necesita.

### Nota — webhook de GitHub

Endpoint `POST /api/webhooks/github`, content type `application/json` (también acepta form-urlencoded),
secret = `GITHUB_WEBHOOK_SECRET`, evento push. La URL del repo se compara normalizada (con/sin `.git`,
https/ssh), responde `202` y despliega en segundo plano el sha exacto del push. Al crear el webhook
GitHub envía un `ping`: si en _Recent Deliveries_ no aparece nada, GitHub no ha llamado al panel.

### Nota — backups

Configuración → Backups: destino S3 compatible o SFTP (credencial SSH del Panel), copia diaria a la
hora elegida (Europe/Madrid), 7 diarias + 4 semanales. Cada copia es un snapshot de restic con
`panel-db.dump` (`pg_dump -Fc`) y `traefik/` (dinámica + `acme.json`). La caché de restic y el
`known_hosts` del destino SFTP viven en `<REPOS_DIR>/.backups/`. El kit de recuperación (repositorio
y clave) se muestra una sola vez; sin él y sin la `ENCRYPTION_KEY` del `.env` no se recupera nada.
Recuperar en una VPS nueva: `docs/recuperacion.md`.

---

## Skills disponibles

| Skill                            | Cuándo invocarla                                          |
| -------------------------------- | --------------------------------------------------------- |
| `/tdd`                           | Feature nueva o bug fix — siempre test primero            |
| `/prototype`                     | Antes de comprometerse con un diseño — explorar opciones  |
| `/diagnose`                      | Bug difícil o regresión de rendimiento                    |
| `/grill-me`                      | Stress-test de un plan o diseño antes de implementar      |
| `/handoff`                       | Fin de sesión o contexto largo — compactar para continuar |
| `/to-issues`                     | Convertir un plan en issues accionables                   |
| `/zoom-out`                      | Revisión de arquitectura a alto nivel                     |
| `/security-review`               | Antes de merge a `master` si hay cambios sensibles        |
| `/improve-codebase-architecture` | Oportunidades de refactor en el proyecto                  |
| `/triage`                        | Procesar issues entrantes                                 |
| `/qa`                            | Checklist de calidad antes de entregar                    |
| `/frontend-design`               | Crear componentes UI con la identidad Command Line        |
| `/setup-claude-env`              | Actualizar este CLAUDE.md cuando cambie el proyecto       |

---

## Lenguaje del dominio

Términos clave — usar exactamente estos nombres en ficheros, variables y mensajes:

- **Panel** — la propia aplicación vicalba-app
- **VPS** — el servidor único que aloja todo
- **Cliente** — entidad contratante; nunca accede al panel
- **Proyecto** — unidad de despliegue de un cliente (= un `docker-compose.yml` + red Docker)
- **Servicio** — cada contenedor dentro de un proyecto
- **Red de proyecto** — red Docker bridge dedicada al proyecto
- **Deploy** — acción de desplegar o redesplegar desde GitHub
- **Auto-deploy** — toggle que activa deploy automático al recibir webhook
- **Proxy** — Traefik; el reverse proxy
- **Dominio** — nombre asociado a un servicio, enrutado por Traefik
- **Certificado** — SSL/TLS emitido por Let's Encrypt
- **Estado** — `running` | `stopped` | `error` | `deploying`

Ver `CONTEXT.md` para el glosario completo.

---

## Estado actual del proyecto

<!-- Actualiza esta sección al inicio de cada sesión relevante -->

- **Fase activa:** —
- **Completado:**
  - Fase 1: Auth (NextAuth v5 JWT, login/logout, middleware, rutas protegidas)
  - Fase 2: Start/Stop (dockerode lib, tRPC iniciar/detener, Server Actions, ProjectCard UI)
  - Fase 3: Restart + Logs SSE (streamProyectoLogs, SSE route, useContainerLogs, LogsPanel)
  - Fase 4: CRUD (clientes router, proyectos.crear/editar/eliminar, formularios modales, dashboard interactivo)
  - Fase 5: Deploy (HMAC webhook GitHub, Traefik config dinámica, deployProyecto lib, auto-deploy toggle, security review aplicado)
  - Fase 6: Redes Docker por cliente (cliente-[slug]-network, compose override, asegurar/eliminar en crear/eliminar proyecto), health check real (DB + Docker daemon, 503 si degraded)
  - Rollback: campo sha en Deploy, deployProyecto retorna sha, procedure rollback, botón Rollback en historial
  - Gestión de dominios: conectarTraefikARed/desconectarTraefikDeRed auto en crear/editar/eliminar, leerEstadoSSL desde acme.json (Zod), SSLBadge en detalle de proyecto (328 tests, en master)
  - Notificaciones de deploy: ConfiguracionNotificacion en BD, adaptadores webhook/email/nodemailer/Telegram, orquestador Promise.allSettled fire-and-forget, configuracionRouter obtener/guardar (SMTP cifrado), UI en /configuracion (367 tests, en master)
  - Refactor deploy sin servicios: eliminado modelo Servicio de BD/router/UI; deploy real vía `docker compose -p ${clienteSlug}-${proyectoNombre}`; start/stop/restart/logs por label `com.docker.compose.project`; edición de dominio/repositorioUrl/rama sin restricción de estado (patrón Coolify); entorno dev resiliente (Docker calls no bloquean sin daemon)
  - CI/CD pipeline: GitHub Actions (lint + type-check + test:unit); variables de entorno inyectadas en deploy; SSE de logs sin contenedores intermedios (en master, branch feature/ci-deploy-variables-sse)
  - Credenciales SSH: modelo CredencialSSH cifrado en BD (clavePublica + clavePrivada AES-256-GCM), router CRUD, GIT_SSH_COMMAND en deploy, UI gestión + asignación por proyecto
  - Tipos de proyecto multi-tipo: enum TipoProyecto (compose/dockerfile/nodejs/image), campos puerto/imagenUrl/dockerfilePath/buildCommand/startCommand; deploy genera Dockerfile+compose dinámico según tipo; buildCommand/startCommand con fallback a package.json; form dinámico con campos condicionales; botón Editar en detalle de proyecto; parseTRPCError para UX de validación (412 tests, branch feature/ci-deploy-variables-sse)
  - Hotfix producción (`hotfix/traefik-ssl-prisma-config`, en master): prisma.config.ts copiado al runner Docker; tlsChallenge en Traefik; ACME_EMAIL via CLI arg; ENCRYPTION_KEY y DOCKER_GID en docker-compose; trustHost en NextAuth; asegurarRedCliente idempotente en deploy; UIDs explícitos (1001) en Dockerfile; git+openssh+docker-cli instalados en runner; alias de red en conectarContenedoresARedCliente
  - Fixes de deploy SSH (`hotfix/build-time-variables`): conversión automática HTTPS→SSH cuando hay credencial asignada; normalización de clave privada (Unix line endings + newline final); DOCKER_BUILDKIT=1 en docker compose; conectarTraefikARed en cada deploy (idempotente)
  - Variables build-time (`hotfix/build-time-variables`): campo enBuildTime en VariableEntorno; proyectos nodejs usan Dockerfile multi-stage (vars en .env.local del stage builder, imagen final limpia); toggle por variable en UI; router variables expone toggleBuildTime
  - Gestión de usuarios: CRUD completo (crear/editar/cambiar password/eliminar), router usuarios, GestionUsuarios UI, enlace en sidebar (PR #20, en develop)
  - Logs de deploy SSE: stream en tiempo real del proceso de deploy sin contenedores intermedios (PR #19, en develop)
  - Importación masiva de variables: parseo de contenido .env, upsert por clave, informe de creadas/actualizadas/inválidas (PR #17, en develop)
  - Volúmenes persistentes + file manager: modelo Volumen en BD, router CRUD, bind mounts en deploy, API `/api/volumes/[id]/files` (GET/POST/DELETE con navegación de subdirectorios), componente VolumenesPanel con explorador básico (PR #21, en develop)
  - CI/CD estabilización: Node 22 en GitHub Actions, `npm install --prefer-offline` (cross-platform con macOS lock file), cobertura 100% en routers, audit sin high vulns (nodemailer ^9.0.1, hono ^4.12.26)
  - Script de desarrollo local: `scripts/dev.sh` (start/stop/reset/status), crea .env.local automáticamente, detecta socket Docker
  - UX improvements (`feature/ux-improvements`, PR #→develop): bug SSL (sans nullish), botón Abrir URL (AbrirUrlBoton con HTTPS/HTTP según sslActivo), file manager modal 85vw×85vh (ZIP download con fflate, mkdir, drag & drop, breadcrumb Home), logs modal 80vw×80vh (useContainerLogs propio, filtros ALL/ERR/WARN/INFO/DEBUG por nivel Pino, toggle timestamps, limpiar buffer), dark/light theme toggle (useTheme DOM-first, ThemeToggle sol/luna en sidebar, tokens.css paleta completa dark+light, script inline anti-FOUC, 578 tests)
  - Rediseño UI (`feature/new_ui_design`, PR #24 → develop): sidebar con nav completo (Dashboard/Proyectos/Usuarios/Configuración) e iconos; StatsBar con componente Sparkline en las 4 métricas (Total/Running/Stopped/Error); página Proyectos agrupada por ClientSection con botones + Proyecto / Editar / Eliminar recuperados; ProjectCard simplificada (Logs → modal, Ver → detalle); detalle de proyecto con breadcrumb, barra de acciones, zona peligrosa con EliminarProyectoButton (confirmación dos pasos); DeployLogsPanel con diseño card consistente; página Configuración modernizada (avatar, cards bg-surface, campos mono); nuevos componentes Sparkline, DominioSSLModal, icons barrel; cobertura funciones componentes 87% (tests EliminarProyectoButton, EditarProyectoButton, icons; 572 tests)
  - Compose editor (`feature/compose-editor`, PR #27 → develop): campo composeContent (Text) en Proyecto; editor Monaco lazy-loaded con YAML para proyectos tipo compose; deploy sin repositorio cuando hay composeContent (escribe en panelDir + --env-file); extraerServicios() parsea servicios del YAML en tiempo real; selector de servicio client-side en LogsPanel y LogsModal (aparece con >1 servicio); formulario mejorado (repo opcional para compose con hint, rama oculta sin repo); migración automática en arranque Docker ya existente; 585 tests
  - Fix CSP Monaco (develop): Monaco Editor servido desde /monaco-editor/vs (prebuild copia min/vs a public/); CSP no necesita cdn.jsdelivr.net; worker-src blob: para workers internos
  - Security review (develop): valorSchema con regex /^[^\r\n]\*$/ en router variables (crear + actualizar) — previene newline injection en --env-file de docker compose
  - Compose env y UI fixes (`hotfix/compose-env-and-ui-fixes`): botón "↺ Recargar del repo" en ComposeEditor (clona/actualiza repo vía `prepararRepo`/`ensureRepo` exportado, procedure `cargarComposeDesdeRepo`, sustituye `build:`/`context: .` por ruta relativa `../{nombre}` para build context válido sin rutas absolutas); fix `.env` siempre escrito en deploy aunque no haya variables configuradas (modo repo: `repoDir/.env`; modo composeContent: `panelDir/{nombre}.env` + `panelDir/.env`) — evita error cuando el compose usa `env_file: .env`; VariablesPanel rediseñado con editor Monaco unificado en formato `.env` (botón "Editar variables" descifra y carga, guardar sincroniza con upsert/eliminación; lista muestra `KEY=••••••••` con toggle build-time y eliminar con confirmación), nuevas procedures `variables.listarConValores`/`variables.sincronizar` y server actions `cargarVariablesAction`/`sincronizarVariablesAction`; fix race condition Docker "network sandbox" en `conectarContenedoresARedCliente` (error ignorado como warning tras `docker compose up -d`, se reintenta en el próximo deploy); feedback visual en Iniciar/Detener/Reiniciar (componente `ProjectActionButton` con `useTransition` — botón deshabilitado y texto "Iniciando…/Deteniendo…/Reiniciando…" mientras la Server Action está en curso; `ToastProvider`/`useToast` propio en `src/components/ui/Toast.tsx`, sin dependencias nuevas, montado en el layout del panel — sustituye el descarte silencioso de errores de los Server Actions por un toast de éxito/error); cobertura 100% restaurada en `src/server/routers/**` (tests de `cargarComposeDesdeRepo`, rama `isComposeDirectoRollback` en `rollback`, rama de `\r` suelto en `variables.sincronizar`) (601 tests, en hotfix/compose-env-and-ui-fixes)
  - Hotfix compose-env, logs, webhook y email (`hotfix/compose-env-and-ui-fixes`, PR #34 → master): variables build-time en compose desde repo (`.env` temporal) y `build.args` en tipo dockerfile; `GIT_SHA_SHORT` inyectado en el build; logs de deploy SSE en el detalle (stream en `globalThis` con replay: el Map por módulo no se compartía entre rutas); webhook con URL normalizada, `202` en segundo plano, ping/form-urlencoded, y `lanzarDeploy()` único para botón/rollback/webhook (antes webhook y rollback no pasaban volúmenes ni composeContent); email con `secure` en 465, timeout 10s, errores registrados con Pino y botón «Enviar prueba» (`configuracion.probarEmail`); audit de producción a 0 high (overrides `dompurify`, `deepmerge-ts`)
  - Rediseño del Panel (`feature/rediseno-ui`, PR #36 → develop, #38 → master): tokens dark/light ampliados; `StatusBadge` con forma por estado; sidebar con búsqueda ⌘K (`CommandPalette`), proyectos fijados (`useFijados`, localStorage) y menú plegable en móvil; Dashboard con «Requiere atención» (rollback al último commit correcto), últimos deploys y estado del VPS con certificados por caducar; Proyectos en tabla por cliente (`FilaProyecto`, `ProyectosExplorer` con búsqueda y filtros); detalle con pestañas `?tab=` y `DeployLogsPanel` con fases; Configuración por secciones `?seccion=` con estado real de cada canal. Backend: `leerCertificados()` (caducidad X509, una lectura de acme.json), `Deploy.origen` y estado del último envío por canal (migración `20261013000000`), `proyectos.actividad` / `proyectos.indice`; webhook y Telegram propagan errores y fallan con no-2xx; `useTheme` con `useSyncExternalStore` (el tema claro no se aplicaba por un error de hidratación). Mockup: https://claude.ai/artifact/8KiTGsrRFhkhBKWPDRYaMR (765 tests)
  - Hotfix rendimiento y SSL (`hotfix/traefik-exec-stream`, PR #40 → master): `leerFicheroTraefik` cierra stdout/stderr al terminar el exec (`demuxStream` no los cierra; cada lectura de acme.json esperaba al timeout de 5 s, Dashboard/Proyectos/detalle tardaban ~5 s y el SSL salía siempre "sin certificado"); `leerCertificados`/`leerEstadoSSL` comparten una sola lectura en curso y la cachean 60 s (sin cachear fallos); skeleton `src/app/(panel)/loading.tsx` para todas las páginas del panel (787 tests)
  - Versión 2.1.0 (`feature/v2.1`, PR → develop; detalle para usuarios en `CHANGELOG.md`):
    - Cancelar deploy: resultado `cancelado`; `cancelarDeploy` aborta git/`docker compose` con un `AbortController` por proyecto (registro en `globalThis`; en Linux el CLI reenvía la señal al plugin y BuildKit corta el build); procedure `proyectos.cancelarDeploy` y botón con confirmación (`ProjectActionButton` `confirmLabel`); estado posterior según contenedores (`estadoContenedores`)
    - Timeout de deploy global `ConfiguracionDeploy.timeoutMinutos` (30 por defecto, 0 = sin límite, 5–180) en Configuración → Deploys; notifica solo si salta el timeout
    - Deploys huérfanos: `src/instrumentation.ts` cierra al arrancar los que quedaron `en_curso` (`limpiarDeploysHuerfanos`)
    - Health check y Dashboard con `proxy` (contenedor Traefik running) y `certificados` (acme.json legible); checks en paralelo
    - Logs: la ruta SSE emite `sin_contenedores` / `fin`; visor `VisorLogs` compartido entre el modal y la pestaña Logs del detalle
    - Auth: `middleware.ts` eliminado, `src/proxy.ts` único con la auth de NextAuth (el rate limit/CORS del antiguo `proxy.ts` nunca se ejecutó en producción); 10 intentos/min por IP en `authorize()` (`src/lib/rate-limit.ts`)
    - Volúmenes: `resolverRutaSegura` única en `src/lib/volumenes.ts` (arregla Windows y bloquea borrar la raíz del volumen)
    - Deploy Node.js: `GIT_SHA_SHORT` en el build, Node 22 en los Dockerfiles generados y `<Dockerfile>.dockerignore` con `.git`
    - Sentry en servidor (ver Observabilidad), avisos de `src/lib` por Pino, Telegram con ⏱️ para cancelado
    - Novedades: `CHANGELOG.md` + página `/novedades` + aviso en el Dashboard (ver «Versiones y changelog»)
    - CI también en ramas `feature/**`, `hotfix/**` y `release/**` (854 → 867 tests, todos en verde también en Windows)
  - Versión 2.1.1 (`release/2.1.1`): webhooks de Discord (embed) y Slack (`{ text }`) con el motivo del rechazo en el error; sesiones invalidadas al eliminar el usuario o cambiar su contraseña (`sesionVigente`, `User.sesionesDesde`, 7 días); logs de contenedores limitados a 3 × 10 MB (`LIMITE_LOGS` en composes generados, override `<proyecto>.logging.yml` en compose de usuario, stack del panel); `docker image prune` + `builder prune --filter until=168h` tras cada deploy correcto; Prisma 7.10 alineado y dependencias menores; healthcheck del panel; `.gitattributes` (LF); Dependabot; Release automática al subir un tag (`release.yml` + `notasDeRelease`) (899 tests)
- **En construcción:** v2.2.0 en `feature/v2.2` — fase A de los backups (BD del Panel y Traefik a S3/SFTP con restic, restauración desde el Panel, kit y `docs/recuperacion.md`); fases B (volúmenes) y C (BDs de Clientes) pendientes
- **Bloqueado / pendiente:** ver `docs/roadmap.md`
- **Próximo hito:** verificación real de la fase A (MinIO, SFTP, simulacro de recuperación) y PR a `develop`; después, fases B/C y E2E para la v2.2 (ver `docs/roadmap.md`)
