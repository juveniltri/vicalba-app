# Progreso: Variables de Entorno — Estado para reanudar

**Última actualización:** 2026-06-06 (sesión nocturna autónoma)

---

## Estado general

El plan completo está en:
`docs/superpowers/plans/2026-06-06-variables-entorno.md`

El spec está en:
`docs/superpowers/specs/2026-06-06-variables-entorno-design.md`

---

## Qué está hecho (antes de esta sesión autónoma)

- ✅ Páginas `/proyectos` y `/configuracion` creadas (routes faltaban)
- ✅ Spec de variables de entorno diseñado y aprobado
- ✅ Plan de implementación de 12 tareas escrito y commiteado

## Qué hay que ejecutar (plan de 12 tasks)

| Task | Descripción                                        | Estado       |
| ---- | -------------------------------------------------- | ------------ |
| 1    | Schema Prisma — modelo VariableEntorno + migración | ⬜ Pendiente |
| 2    | ENCRYPTION_KEY en env.ts                           | ⬜ Pendiente |
| 3    | src/lib/crypto.ts — AES-256-GCM (TDD)              | ⬜ Pendiente |
| 4    | Router tRPC variables (TDD)                        | ⬜ Pendiente |
| 5    | Registrar router + proyectos.obtener               | ⬜ Pendiente |
| 6    | Modificar deployProyecto — inyección variables     | ⬜ Pendiente |
| 7    | proyectos.deploy — descifrar y pasar variables     | ⬜ Pendiente |
| 8    | Server Actions para variables                      | ⬜ Pendiente |
| 9    | Componente VariablesPanel (TDD)                    | ⬜ Pendiente |
| 10   | Página de detalle /proyectos/[id]                  | ⬜ Pendiente |
| 11   | /proyectos — cards + enlace detalle                | ⬜ Pendiente |
| 12   | Dashboard simplificado                             | ⬜ Pendiente |

---

## Cómo reanudar mañana

1. Abrir Claude Code en `D:\proyectos-alvaro\vicalba-app`
2. Decir: _"Continuemos con el plan de variables de entorno. Estamos en la Task 1."_
3. Claude leerá `docs/superpowers/plans/2026-06-06-variables-entorno.md` y ejecutará cada task

## Contexto clave para reanudar

- **Rama actual:** `master` (se trabaja directo en master, es proyecto interno 2 personas)
- **Tests actuales:** 207 tests, todos en verde
- **Dependencia crítica del Task 2:** hay que generar `ENCRYPTION_KEY` y añadirla a `.env.local`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Copiar la salida y añadir a `.env.local`:
  ```
  ENCRYPTION_KEY=<valor generado>
  ```
- **Dependencia del Task 1:** necesita PostgreSQL corriendo (dev local usa docker-compose.dev.yml)
  ```bash
  docker compose -f docker-compose.dev.yml up -d
  ```

---

## Notas técnicas del plan

- AES-256-GCM con `node:crypto` — sin dependencias nuevas
- Variables cifradas en BD: clave en texto plano, valor cifrado + IV + authTag
- Deploy: se genera `.env.panel` temporal que se borra en `finally`
- El router `variables.revelar` es `.mutation` (acción deliberada)
- El componente `VariablesPanel` es `"use client"` con reveal timeout de 30s
