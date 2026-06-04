# Propuesta Técnica — vicalba-app

**Fecha:** 2026-06-04
**Para:** Uso interno del equipo técnico

---

## Resumen ejecutivo

Panel de gestión de infraestructura propio, diseñado para centralizar el despliegue y operación de proyectos de clientes en una VPS única. Elimina la dependencia de herramientas de terceros (Coolify, Forge, etc.) y permite automatizar los flujos de deploy vía GitHub webhooks.

---

## Problema que resuelve

Actualmente cada proyecto de cliente requiere acceso SSH manual a la VPS, edición de ficheros de configuración de Nginx/proxy y gestión manual de certificados SSL. Con múltiples clientes y proyectos, esto es:
- Lento y propenso a errores
- Sin trazabilidad de qué se desplegó y cuándo
- Sin aislamiento entre proyectos de distintos clientes

---

## Solución propuesta

Un panel web interno con:
1. **Dashboard de proyectos** — visión global de todos los servicios y su estado
2. **Deploy automatizado** — desde GitHub con un click o automáticamente al hacer merge
3. **Proxy + SSL** — Traefik gestiona el enrutado de dominios y Let's Encrypt emite certificados sin intervención manual
4. **Logs en tiempo real** — sin necesidad de SSH para depurar
5. **Aislamiento de clientes** — cada cliente en su propia red Docker

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind + shadcn/ui |
| Backend | tRPC, NextAuth v5 |
| Base de datos | PostgreSQL + Prisma |
| Orquestación | Docker + dockerode SDK |
| Proxy | Traefik + Let's Encrypt |
| Real-time | Server-Sent Events |

---

## Fases de desarrollo

### Fase 1 — MVP (Panel + Deploy + Proxy)
Gestión básica de clientes/proyectos, deploy desde GitHub, proxy inverso y SSL automático, logs en tiempo real.

### Fase 2 — Observabilidad y resiliencia
Backups de volúmenes, alertas por caída de contenedores, métricas de uso, gestión de env vars cifradas.

---

## Estimación de esfuerzo (Fase 1)

| Módulo | Estimación |
|---|---|
| Autenticación y estructura base | 1 día |
| CRUD clientes / proyectos | 1 día |
| Integración Docker (deploy, start/stop, logs) | 3 días |
| Traefik — configuración dinámica + SSL | 2 días |
| GitHub Webhooks + auto-deploy | 1 día |
| UI Dashboard + logs en tiempo real | 2 días |
| Testing + hardening | 1 día |
| **Total estimado** | **~11 días** |
