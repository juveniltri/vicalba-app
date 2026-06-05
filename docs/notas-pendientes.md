# Notas pendientes

## Fase 4 — CRUD de proyectos (completado)

Implementado en Fase 4:

- Router `clientes`: crear, editar, eliminar (con guard: no eliminar si tiene proyectos)
- Router `proyectos`: crear, editar (reconcilia servicios), eliminar (no si running)
- 6 Server Actions CRUD en `actions.ts`
- `ClienteFormModal` + `NuevoClienteButton` en `ClienteForm.tsx`
- `ProyectoFormModal` en `ProyectoForm.tsx`
- `ClientSection` → client component con botones Editar/Eliminar/Nuevo proyecto
- `ProjectCard` → botones Editar/Eliminar con confirmación inline
- Dashboard → botón "Nuevo cliente" en cabecera

## Fase 5 — Deploy (próximo)

### Schema DB — campos nuevos en `Proyecto`

- `repositorioUrl: String?` — URL del repo GitHub (e.g. `https://github.com/org/repo`)
- `rama: String?` (default `main`) — rama que dispara el deploy
- `autoDeployHabilitado: Boolean` (default `false`) — toggle auto-deploy

### Traefik config dinámica (`src/lib/traefik/`)

- Función pura `generarConfigProyecto({ dominio, proyectoSlug, clienteSlug })` → objeto YAML
- Función `escribirConfigTraefik(proyectoSlug, config)` → escribe fichero en directorio Traefik
- Función `eliminarConfigTraefik(proyectoSlug)` → borra fichero al eliminar proyecto
- Llamadas integradas en `proyectos.crear`, `proyectos.editar`, `proyectos.eliminar`

### Deploy lib (`src/lib/docker/deploy.ts`)

- `deployProyecto(proyectoId)` → pull imagen + recrear contenedores via dockerode
- Estado `deploying` durante el proceso, `running` al completar, `error` si falla

### Webhook GitHub (`src/app/api/webhooks/github/route.ts`)

- Validar HMAC-SHA256 de `X-Hub-Signature-256` contra `GITHUB_WEBHOOK_SECRET`
- Parsear evento `push` y extraer `repository.clone_url` + `ref` (rama)
- Buscar proyecto con `repositorioUrl` + `rama` coincidentes
- Trigger `deployProyecto` si `autoDeployHabilitado === true`

### UI

- Campos `repositorioUrl` y `rama` en `ProyectoFormModal`
- Toggle auto-deploy en `ProjectCard`
- Botón "Deploy manual" en `ProjectCard` (llama a deploy action)
