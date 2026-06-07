# vicalba-app

## Qué es este proyecto

Panel de control de infraestructura al estilo Coolify/cPanel, diseñado para uso interno de un equipo técnico de 2 personas. Gestiona todos los proyectos Docker en una única VPS: proxy inverso Traefik, SSL automático con Let's Encrypt, deploys desde GitHub vía webhooks y logs en tiempo real. Cada cliente tiene sus servicios aislados en redes Docker dedicadas.

**Stack:** Next.js 15 (App Router) + TypeScript + tRPC + PostgreSQL + Prisma + NextAuth v5 + dockerode + Traefik
**Hosting:** Contenedor Docker en la misma VPS que gestiona

---

## Workflow de desarrollo

### Ramas

```
main          → producción (tags: vX.X.X)
develop       → integración continua
feature/XXX   → funcionalidad nueva (desde develop)
hotfix/XXX    → fix urgente (desde main, PR directo a main + merge a develop)
release/X.X.X → preparación de release (desde develop)
```

**Regla:** nunca se hace commit directo a `main` ni a `develop`. Todo entra por PR.

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

Antes de cada merge a `main`: invoca `/security-review`.

---

## Observabilidad

- **Sentry:** configurado en todos los entornos (excepto test). Captura errores y performance.
- **Pino:** logging estructurado en JSON. Cada log con `level`, `msg`, `context` y `traceId`.
- **Health check:** `GET /api/health` devuelve estado de DB, Docker daemon y versión del deploy.
- **Logs de contenedor:** streaming vía SSE desde `GET /api/projects/[id]/logs` — nunca almacenar logs de contenedor en BD.

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
touch /var/vicalba/traefik/acme.json
chmod 600 /var/vicalba/traefik/acme.json

# Apuntar el DNS del dominio del panel a la IP de la VPS antes de arrancar
```

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
docker compose -f docker-compose.dev.yml up -d   # solo PostgreSQL
cp .env.production.example .env.local             # ajustar DATABASE_URL y vars mínimas
npm run db:migrate && npm run db:seed
npm run dev
```

### Nota — redes de clientes y Traefik

La conexión de Traefik a las redes de cliente es **automática** desde la feature Gestión de Dominios.
Al crear/editar/eliminar un proyecto con dominio, el panel llama a `conectarTraefikARed` /
`desconectarTraefikDeRed` via dockerode. Variable de entorno relevante: `TRAEFIK_CONTAINER_NAME`
(default: `traefik`). Solo hace falta intervención manual en instalaciones con un nombre distinto.

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
| `/security-review`               | Antes de merge a `main` si hay cambios sensibles          |
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
- **En construcción:** —
- **Bloqueado / pendiente:** —
- **Próximo hito:** —
