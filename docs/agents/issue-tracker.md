# Issue Tracker — vicalba-app

## Dónde viven los issues

Los issues del proyecto se gestionan en el repositorio de GitHub bajo `Issues`. No hay herramienta externa de tracking.

## Estructura de un issue

### Título
```
[tipo] descripción corta en imperativo
```
Ejemplos:
- `[feat] Implementar deploy de Docker Compose desde GitHub`
- `[fix] Logs SSE se cortan al reconectar`
- `[chore] Actualizar dockerode a v4`

### Cuerpo

```markdown
## Contexto
¿Por qué es necesario este issue?

## Criterios de aceptación
- [ ] ...
- [ ] ...

## Notas técnicas
<!-- Restricciones, dependencias, ADRs relacionados -->
```

## Estados

| Estado | Significado |
|---|---|
| `open` | Pendiente de asignar o iniciar |
| `in progress` | Asignado y en desarrollo |
| `blocked` | Esperando a otro issue o decisión externa |
| `closed` | Completado y mergeado a `main` o `develop` |

## Milestones

- **Fase 1 MVP** — Panel + Deploy + Proxy
- **Fase 2** — Observabilidad y resiliencia

## Convención de branches

```
feature/[numero-issue]-descripcion-corta
hotfix/[numero-issue]-descripcion-corta
```
