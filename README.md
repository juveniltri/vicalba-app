# vicalba-app

Panel de control de infraestructura al estilo Coolify, diseñado para uso interno. Gestiona todos los proyectos Docker en una única VPS: proxy inverso Traefik, SSL automático con Let's Encrypt, deploys desde GitHub vía webhooks y logs en tiempo real.

---

## Stack

| Capa          | Tecnología                           |
| ------------- | ------------------------------------ |
| Framework     | Next.js 15 (App Router) + TypeScript |
| API           | tRPC (tipado end-to-end)             |
| Base de datos | PostgreSQL + Prisma                  |
| Auth          | NextAuth v5 (credentials)            |
| Contenedores  | Docker + dockerode                   |
| Proxy inverso | Traefik v3 + Let's Encrypt           |
| Tests         | Vitest + Playwright                  |

---

## Funcionalidades

- **Gestión de clientes y proyectos** — CRUD completo, cada cliente aislado en su propia red Docker bridge
- **Tipos de proyecto** — Docker Compose, Dockerfile, Node.js (build propio) e imagen Docker pública
- **Deploy desde GitHub** — clone del repo, build y `docker compose up` orquestado por el panel; variables de entorno cifradas inyectadas en tiempo de deploy
- **Auto-deploy** — webhook GitHub dispara redeploy automático al hacer push a la rama configurada
- **Credenciales SSH** — gestión de claves SSH cifradas (AES-256-GCM) para repos privados
- **Rollback** — reversión al commit anterior con un clic desde el historial de deploys
- **Proxy y dominios** — configuración dinámica de Traefik por proyecto; SSL automático con Let's Encrypt
- **Logs en tiempo real** — streaming SSE de logs de contenedores directamente en el panel
- **Notificaciones** — webhooks, email (SMTP) y Telegram al completar o fallar un deploy
- **Variables de entorno** — almacenadas cifradas en BD, revelables con timeout de 30 s en la UI
- **Métricas del sistema** — CPU, RAM y disco del host vía `/api/system/metrics`
- **CI/CD propio** — GitHub Actions con lint, type-check y tests en cada PR

---

## Estructura del proyecto

```
src/
  app/                  ← Next.js App Router (páginas y layouts)
    (panel)/            ← Rutas protegidas del panel
    api/
      auth/             ← NextAuth
      health/           ← Health check (DB + Docker daemon)
      projects/[id]/logs/ ← SSE streaming de logs
      system/metrics/   ← Métricas del host
      webhooks/github/  ← Receptor de webhooks GitHub (HMAC-SHA256)
      trpc/             ← Handler tRPC
  components/           ← Componentes de UI
  server/
    routers/            ← tRPC routers (clientes, proyectos, variables, credenciales, configuracion)
  lib/
    docker/             ← Integración dockerode (deploy, redes, logs, Traefik)
    traefik/            ← Generación de config dinámica Traefik
    ssl/                ← Lectura de estado SSL desde acme.json
    crypto.ts           ← Cifrado AES-256-GCM
    schemas/            ← Schemas Zod compartidos
  styles/
    tokens.css          ← Design tokens
  env.ts                ← Validación Zod de variables de entorno al arrancar
```

---

## Desarrollo local

### Requisitos

- Node.js 22+
- Docker + Docker Compose

### Arrancar

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env.local
# Editar .env.local con los valores de desarrollo

# 3. Arrancar PostgreSQL + migraciones + seed + Next.js dev server
npm run dev:local
```

> `dev:local` levanta PostgreSQL en Docker, aplica migraciones, carga datos de seed y arranca el servidor de desarrollo. Todos los pasos en uno.

### Scripts

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

## Deploy en producción

Ver [`production.md`](./production.md) para la guía completa paso a paso.

Resumen:

```bash
# En la VPS (Ubuntu):
curl -fsSL https://get.docker.com | sh
mkdir -p /var/vicalba/traefik/dynamic /var/vicalba/repos
touch /var/vicalba/traefik/acme.json && chmod 600 /var/vicalba/traefik/acme.json

git clone git@github.com:juveniltri/vicalba-app.git /opt/vicalba-app
cd /opt/vicalba-app
cp .env.production.example .env   # rellenar valores
docker compose up -d --build
```

### Variables de entorno requeridas

| Variable                | Descripción                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD`           | Contraseña de PostgreSQL                                                                                   |
| `NEXTAUTH_SECRET`       | Secret JWT — `openssl rand -base64 32`                                                                     |
| `NEXTAUTH_URL`          | URL pública del panel (`https://panel.dominio.com`)                                                        |
| `PANEL_DOMAIN`          | Dominio sin protocolo (`panel.dominio.com`)                                                                |
| `ACME_EMAIL`            | Email para notificaciones de Let's Encrypt                                                                 |
| `GITHUB_WEBHOOK_SECRET` | Secret HMAC — `openssl rand -hex 32`                                                                       |
| `ENCRYPTION_KEY`        | 64 hex chars para AES-256-GCM — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

---

## API

### REST

| Endpoint                  | Método | Descripción                                       |
| ------------------------- | ------ | ------------------------------------------------- |
| `/api/health`             | GET    | Estado del sistema (DB + Docker daemon + versión) |
| `/api/projects/[id]/logs` | GET    | SSE — stream de logs del proyecto                 |
| `/api/system/metrics`     | GET    | CPU, RAM y disco del host                         |
| `/api/webhooks/github`    | POST   | Receptor de webhooks GitHub (HMAC-SHA256)         |

### tRPC

Todos los procedures requieren sesión activa. Accesibles en `/api/trpc`.

| Router          | Procedures                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `clientes`      | `listar`, `crear`, `editar`, `eliminar`                                                                                  |
| `proyectos`     | `listar`, `obtener`, `crear`, `editar`, `eliminar`, `deploy`, `rollback`, `iniciar`, `detener`, `reiniciar`, `estadoSSL` |
| `variables`     | `listar`, `crear`, `editar`, `eliminar`, `revelar`                                                                       |
| `credenciales`  | `listar`, `crear`, `editar`, `eliminar`                                                                                  |
| `configuracion` | `obtener`, `guardar`                                                                                                     |

---

## Arquitectura Docker en producción

```
VPS
├── traefik          ← Puerto 80/443, proxy inverso + SSL
├── vicalba-db       ← PostgreSQL
├── vicalba-panel    ← Este panel (puerto 3000, interno)
└── [proyectos de clientes]
      ├── cliente-foo-network   ← red bridge aislada
      └── contenedores del proyecto (gestionados por el panel)
```

Traefik se conecta dinámicamente a las redes de cliente cuando se asigna un dominio a un proyecto.

---

## Testing

Estrategia 100/80/0:

| Tier           | Carpetas                                         | Cobertura      |
| -------------- | ------------------------------------------------ | -------------- |
| Core           | `src/server/routers/`, `src/lib/`, `src/domain/` | 100%           |
| Important      | `src/components/`, `src/hooks/`, `src/utils/`    | 80%            |
| Infrastructure | `src/config/`, `src/db/`, `src/lib/docker/`      | 0% (sin tests) |

```bash
npm run test:unit        # 412+ tests
npm run type-check       # TypeScript estricto
```

---

## Workflow de ramas

```
master        ← producción
develop       ← integración (PRs desde feature/*)
feature/XXX   ← funcionalidad nueva
hotfix/XXX    ← fix urgente (→ master + develop)
```

Nunca se hace commit directo a `master` ni a `develop`.
