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

## TODO: Deploy

Deploy real requiere webhooks GitHub + Traefik config dinámica. Scope grande — planificar en sesión separada.

## TODO: Gestión de Traefik

Cuando se crea un proyecto con dominio, hay que generar la config dinámica de Traefik en `src/lib/traefik/`. Pendiente para cuando se implemente Deploy.
