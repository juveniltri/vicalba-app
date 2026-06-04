---
name: setup-claude-env
description: Genera el entorno completo de Claude Code para un proyecto — CLAUDE.md con todas las convenciones, AGENTS.md, docs/agents/, REFACTORING.md y docs/adr/. Se puede invocar desde la skill new-project o directamente para actualizar la config de un proyecto existente.
metadata:
  type: skill
---

# Skill: setup-claude-env

Configuras el entorno de Claude Code para el proyecto actual. Lees el PROJECT.md para personalizar la salida y generas todos los ficheros que Claude necesita para trabajar bien en este proyecto.

---

## Paso 1 — Detección del contexto

1. Determina el directorio objetivo (`TARGET_DIR`):
   - Si te invocó la skill `new-project`, usa el `TARGET_DIR` que te pasó
   - Si te invocaron directamente, usa el directorio actual del proyecto

2. Lee `TARGET_DIR/PROJECT.md`. Extrae:
   - `nombre_proyecto` — campo Nombre del Proyecto
   - `descripcion` — sección Descripción (primer párrafo)
   - `stack_frontend` — Framework + UI + Lenguaje
   - `stack_backend` — Framework + Tipo API
   - `stack_db` — Motor + ORM
   - `tiene_auth` — sección Autenticación: ¿tiene solución distinta de N/A?
   - `hosting` — campo Hosting
   - `fases` — resumen de fases y estados

3. Lee `TARGET_DIR/CONTEXT.md` si existe. Extrae el lenguaje del dominio (términos clave).

4. Si `PROJECT.md` no existe o le falta la sección Stack Técnico:
   - Detente y avisa: "Necesito el PROJECT.md completo. Invoca `/project-context` primero."

---

## Paso 2 — Pregunta clave

Haz UNA sola pregunta antes de generar nada:

> "¿Este proyecto tiene autenticación de usuarios (login, roles, sesiones)?"
>
> - Sí → activo el módulo de seguridad completo
> - No → activo solo el baseline de seguridad

Guarda la respuesta como `tiene_auth`.

---

## Paso 3 — Generar CLAUDE.md

Crea `TARGET_DIR/CLAUDE.md` usando la plantilla en `_templates/skills/setup-claude-env/resources/CLAUDE.md.template`.

Sustituye todos los placeholders con los valores extraídos del PROJECT.md:

- `[NOMBRE_PROYECTO]` → nombre del proyecto
- `[DESCRIPCION]` → descripción breve
- `[STACK_RESUMEN]` → una línea con el stack (ej: "Next.js 15 + Tailwind + Drizzle + PostgreSQL")
- `[HOSTING]` → plataforma de hosting
- `[TERMINOS_DOMINIO]` → lista de términos del CONTEXT.md si existe, si no "Ver CONTEXT.md cuando se cree"

Si `tiene_auth = true`: incluye la sección de seguridad completa.
Si `tiene_auth = false`: incluye solo el baseline de seguridad.

---

## Paso 4 — Generar REFACTORING.md

Copia `_templates/resources/REFACTORING.md` a `TARGET_DIR/REFACTORING.md` sin modificar — es genérico y válido para cualquier proyecto.

---

## Paso 5 — Generar docs/adr/

1. Crea el directorio `TARGET_DIR/docs/adr/`
2. Copia `_templates/resources/docs/adr/0000-template.md` → `TARGET_DIR/docs/adr/0000-template.md`
3. Crea `TARGET_DIR/docs/adr/0001-initial-architecture.md` rellenando el template con:
   - **Título:** Arquitectura inicial del proyecto
   - **Contexto:** descripción del proyecto y restricciones conocidas (equipo, presupuesto, plazos del PROJECT.md)
   - **Decisión:** el stack elegido con justificación breve
   - **Consecuencias:** trade-offs del stack (extráelos del razonamiento del PROJECT.md si están)

---

## Paso 6 — Configurar docs/agents/ (via setup-matt-pocock-skills)

**Invoca `/setup-matt-pocock-skills`** para configurar:

- `docs/agents/issue-tracker.md`
- `docs/agents/triage-labels.md`
- `docs/agents/domain.md`
- El bloque `## Agent skills` en el CLAUDE.md generado

> Di al usuario: "Voy a invocar `/setup-matt-pocock-skills` para configurar el issue tracker y los agent docs."

---

## Paso 7 — Cierre

Muestra el listado de ficheros creados con sus rutas y una línea de descripción de cada uno.

Si algo falló o quedó incompleto, lista los items pendientes con instrucción exacta para resolverlos.

Pregunta: "¿Quieres ajustar algo del CLAUDE.md antes de continuar?"

- Si sí: aplica cambios
- Si no: termina
