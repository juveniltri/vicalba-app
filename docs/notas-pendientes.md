# Notas pendientes

## Fase 3 — gestión Docker avanzada

### TODO: implementar restart en docker lib y router

`ProjectCard` tiene `handleAction("restart")` como stub (`setTimeout`). Pendiente:

1. `restartProyecto` en `src/lib/docker/proyectos.ts` — stop + start por servicio
2. Procedimiento `restart` en `src/server/routers/proyectos.ts`
3. Server Action `restartAction` en `src/app/(panel)/actions.ts`
4. Conectar botón Restart en `ProjectCard`

### TODO: logs en tiempo real (SSE)

- Route handler `src/app/api/projects/[id]/logs/route.ts` — stream SSE desde dockerode
- Hook `useContainerLogs(id)` en componente de detalle
- Nunca almacenar logs en BD (ver CLAUDE.md Observabilidad)

### TODO: Deploy

Deploy real requiere webhooks GitHub + Traefik config dinámica. Scope grande — planificar en sesión separada.
