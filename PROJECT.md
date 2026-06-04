# vicalba-app

## Metadata

| Campo            | Valor                                      |
| ---------------- | ------------------------------------------ |
| Cliente          | Interno (equipo técnico, 2 usuarios)       |
| Tipo             | Panel de gestión de infraestructura        |
| Estado           | Idea                                       |
| Inicio estimado  | 2026-06-04                                 |
| Entrega estimada | MVP Fase 1 — TBD                           |
| URL producción   |                                            |
| URL staging      |                                            |
| Repositorio      |                                            |

## Descripción

Panel de control de infraestructura al estilo Coolify/cPanel, diseñado para uso interno de un equipo técnico de 2 personas. Gestiona todos los proyectos Docker que corren dentro de **una única VPS**. El panel actúa como puerta de entrada: configura el proxy inverso (Traefik), gestiona dominios/SSL, orquesta contenedores y automatiza deploys vía webhooks de GitHub.

Cada cliente tiene sus proyectos aislados en redes Docker separadas — sin comunicación entre clientes.

## Público objetivo

Uso 100% interno. Solo 2 usuarios técnicos con acceso completo.

---

## Stack Técnico

### Frontend

- **Framework:** Next.js 15 (App Router)
- **UI / Componentes:** Tailwind CSS + shadcn/ui
- **Estado global:** TanStack Query (server state) + Zustand (UI state mínimo)
- **Lenguaje:** TypeScript estricto

### Backend

- **Framework:** Next.js API Routes
- **API:** tRPC (tipado end-to-end)
- **Lenguaje:** TypeScript / Node.js

### Base de datos

- **Motor:** PostgreSQL
- **ORM:** Prisma

### Autenticación

- **Solución:** NextAuth v5 (credentials — email + password)
- **Roles:** admin (únicos 2 usuarios, acceso total)

### Infraestructura del panel

- **Hosting del panel:** Contenedor Docker dentro de la misma VPS que gestiona
- **Proxy inverso:** Traefik (configuración dinámica, gestiona el enrutado de todos los proyectos)
- **SSL:** Let's Encrypt automático vía Traefik
- **CI/CD:** GitHub Actions (para el propio panel)

### Servicios externos

- **Docker SDK:** dockerode (Node.js) — control del daemon Docker local
- **GitHub Webhooks:** recepción de eventos push/merge para auto-deploy
- **Real-time:** Server-Sent Events (streaming de logs de contenedores)

---

## Features Fase 1 — MVP

### Core (imprescindible)

- Autenticación segura (2 usuarios, sesión persistente)
- Gestión de clientes y proyectos (CRUD, aislamiento por red Docker)
- Deploy de proyectos Docker Compose desde repositorio GitHub
- Webhook GitHub → trigger de redeploy por rama (configurable: manual / automático)
- Proxy inverso dinámico: mapeo dominio → contenedor vía Traefik
- SSL automático (Let's Encrypt) por dominio
- Logs en tiempo real de contenedores (SSE)
- Start / stop / restart de servicios desde el dashboard
- Panel de estado de contenedores (running, stopped, error)

### Nice to have (deseable)

- Histórico de deploys con diff de variables de entorno
- Notificaciones internas al completar un deploy (toast / badge)
- Búsqueda y filtrado de proyectos/clientes

### Fuera de alcance (Fase 1)

- Gestión de múltiples VPS
- Acceso de clientes finales al panel
- Facturación / billing
- Backups automáticos

## Features Fase 2 — Madurez operacional

### Core

- Backups automáticos de volúmenes Docker (cron configurable)
- Gestión de variables de entorno por proyecto (cifradas en DB)
- Alertas por email/webhook si un contenedor cae
- Panel de métricas (CPU, RAM, disco por contenedor)

### Nice to have

- CLI propio para operar el panel desde terminal
- Soporte para múltiples VPS

---

## Fases y Roadmap

### Fase 1 — MVP (Panel + Deploy + Proxy)

- **Objetivo:** Tener operativo el panel con gestión de clientes, proyectos Docker, proxy inverso, SSL y auto-deploy vía webhooks.
- **Deliverables:**
  - Panel funcional con auth
  - CRUD clientes/proyectos
  - Deploy Docker Compose desde GitHub
  - Traefik configurado dinámicamente
  - SSL Let's Encrypt automático
  - Logs en tiempo real
- **Estado:** Pendiente

### Fase 2 — Observabilidad y resiliencia

- **Objetivo:** Añadir backups, alertas, métricas y gestión segura de secrets.
- **Estado:** Pendiente

---

## Diseño y UI

### Identidad visual

Ver detalle completo en `docs/design/DESIGN.md`.

- **Dirección:** Command Line
- **Paleta primaria:** `#1D4ED8` (blue-700) con acento cyan `#22D3EE`
- **Fondo oscuro:** `#030712` / surface `#0F172A`
- **Fondo claro:** `#F8FAFC` / surface `#FFFFFF`
- **Tipografía display:** Space Grotesk (600, 700)
- **Tipografía body:** JetBrains Mono (400, 500, 600)
- **Border radius:** 3px — sharp
- **Estilo general:** Terminal meets modern infra — preciso, oscuro, monospace

### Referencias e inspiración

- https://coolify.io — referencia principal de UX
- Vercel dashboard — claridad en logs y deploys
- Portainer — gestión de contenedores

### Recursos

- **Figma / diseño:** N/A — tokens en `src/styles/tokens.css`
- **Logos / assets:** Por definir
- **Iconos:** Lucide

---

## Consideraciones Técnicas

### SEO

- **Requerido:** No (panel privado, sin indexación)

### Rendimiento

- **Prioridad:** Alta
- **Notas:** Los logs en tiempo real y el estado de contenedores deben ser rápidos. SSE + polling optimizado. No bloquear el hilo principal con operaciones Docker.

### Accesibilidad

- **Nivel requerido:** Básico (uso interno)

### Internacionalización (i18n)

- **Multiidioma:** No

### Seguridad

- **Notas:**
  - Panel solo accesible desde red privada o con VPN (recomendado)
  - Rate limiting en endpoints de auth
  - Variables de entorno cifradas en reposo
  - Aislamiento Docker: cada cliente en su propia red bridge
  - Webhook secret validation (HMAC GitHub)
  - HTTPS obligatorio en producción (Traefik + Let's Encrypt)

### Arquitectura Docker

- El panel corre como `docker-compose` en la VPS
- Accede al socket Docker (`/var/run/docker.sock`) montado como volumen
- Traefik corre en la misma VPS como proxy inverso principal
- Cada proyecto de cliente se despliega en una red Docker aislada (`bridge` dedicado)

---

## Instrucciones para Claude

### Contexto de sesión

- Este es un panel de infraestructura interno para 2 usuarios técnicos
- La VPS es la única instancia gestionada (no multi-VPS)
- Traefik gestiona el proxy — no usar Nginx ni Caddy
- dockerode es el SDK para interactuar con Docker desde Node.js

### Convenciones del proyecto

- Estructura Next.js App Router: `src/app/`, `src/components/`, `src/server/`
- tRPC routers en `src/server/routers/`
- Schemas Zod en `src/lib/schemas/`
- TypeScript estricto — sin `any`

### Preferencias de código

- TypeScript estricto siempre
- Sin comentarios salvo WHY no obvio
- Tests con Vitest
- Sin `any`, sin `as unknown`
- Preferir Server Components de Next.js cuando no se necesite interactividad

### Cosas a evitar

- No usar Nginx ni Caddy (solo Traefik)
- No instalar librerías sin preguntar
- No crear ficheros fuera de `src/` sin justificación
- No hardcodear IPs ni credenciales

### Estado actual del proyecto

- Fase 0: scaffold inicial en curso

### Notas adicionales

- El acceso al socket Docker requiere que el proceso corra como root o en el grupo `docker` — documentar esto en el README de deploy
- Traefik necesita acceso a un volumen compartido para su configuración dinámica
