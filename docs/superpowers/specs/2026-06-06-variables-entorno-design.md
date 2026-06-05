# Spec: Variables de entorno por proyecto

**Fecha:** 2026-06-06
**Estado:** Aprobado — pendiente de implementación
**Alcance:** Variables de entorno cifradas + página de detalle de proyecto + reestructura de vistas Dashboard y /proyectos

---

## Contexto

Hoy el deploy ejecuta `docker compose up` con el `docker-compose.yml` del repo tal cual. No hay forma de inyectar secrets (contraseñas de BD, API keys, tokens) desde el panel — hay que ponerlos en el repo (inseguro) o entrar por SSH (manual).

Este spec añade gestión de variables de entorno cifradas por proyecto, accesibles desde una nueva página de detalle, e inyectadas automáticamente en cada deploy.

---

## Decisiones de diseño

| Decisión             | Elección                                                             | Motivo                                                                    |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Alcance de variables | Por proyecto (compartidas por todos los servicios)                   | YAGNI — cubre el 95% de casos, nivel de servicio como extensión futura    |
| Cifrado              | AES-256-GCM con `node:crypto`                                        | Sin dependencias nuevas, autenticado (integridad + confidencialidad)      |
| Qué se cifra         | Solo el valor                                                        | Los nombres de variable no son sensibles; cifrarlos complica queries y UX |
| Clave de cifrado     | Nueva variable de entorno `ENCRYPTION_KEY` (32 bytes / 64 hex chars) | Separación de responsabilidades; independiente de `NEXTAUTH_SECRET`       |
| Almacenamiento       | Un registro por variable en BD                                       | Permite CRUD individual, auditable, consistente con el resto del schema   |
| Inyección en deploy  | Fichero `.env` temporal via `--env-file`, borrado en `finally`       | Nunca persiste en disco más allá del deploy                               |

---

## Schema — nuevo modelo Prisma

```prisma
model VariableEntorno {
  id            String   @id @default(cuid())
  proyecto      Proyecto @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  proyectoId    String
  clave         String        // texto plano — ej: "DATABASE_URL"
  valorCifrado  String        // AES-256-GCM cifrado, base64
  iv            String        // hex — vector de inicialización único por cifrado
  authTag       String        // hex — tag de autenticación GCM
  creadoEn      DateTime @default(now())
  actualizadoEn DateTime @updatedAt

  @@unique([proyectoId, clave])
}
```

Relación inversa añadida a `Proyecto`:

```prisma
variables VariableEntorno[]
```

---

## Variable de entorno nueva

`ENCRYPTION_KEY` — 64 caracteres hexadecimales (256 bits).

Validación en `src/env.ts`:

```ts
ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "ENCRYPTION_KEY debe ser 64 chars hex"),
```

Generación en la VPS:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Capa de cifrado — `src/lib/crypto.ts`

Dos funciones puras, sin estado, sin dependencias externas:

```ts
cifrar(valor: string): { valorCifrado: string; iv: string; authTag: string }
descifrar(valorCifrado: string, iv: string, authTag: string): string
```

- Algoritmo: AES-256-GCM
- IV: 12 bytes aleatorios generados en cada llamada a `cifrar` (nunca reutilizados)
- Output: base64 para `valorCifrado`, hex para `iv` y `authTag`
- Si el `authTag` no coincide al descifrar, `node:crypto` lanza error — integridad garantizada

---

## API — nuevo router `src/server/routers/variables.ts`

Todos los procedimientos son `protectedProcedure`.

| Procedimiento | Input                          | Output                      | Notas                                              |
| ------------- | ------------------------------ | --------------------------- | -------------------------------------------------- |
| `listar`      | `{ proyectoId }`               | `{ id, clave, creadoEn }[]` | Sin valores, ni cifrados ni en claro               |
| `crear`       | `{ proyectoId, clave, valor }` | `VariableEntorno`           | Cifra antes de guardar                             |
| `actualizar`  | `{ id, valor }`                | `VariableEntorno`           | Genera nuevo IV — nunca reutiliza                  |
| `eliminar`    | `{ id }`                       | `void`                      | Borra el registro                                  |
| `revelar`     | `{ id }`                       | `{ valor: string }`         | Descifra y devuelve — acción deliberada y separada |

`listar` no devuelve `valorCifrado` — el valor nunca sale de servidor salvo por `revelar`.

Registrar el router en `src/server/routers/_app.ts` como `variables`.

---

## Deploy — modificación de `src/lib/docker/deploy.ts`

`deployProyecto` recibe un nuevo parámetro:

```ts
variables?: Array<{ clave: string; valor: string }>
```

Si `variables` tiene elementos, antes del `docker compose up`:

1. Serializa a formato `.env` (`CLAVE=valor\n` por línea)
2. Escribe el fichero en `${repoDir}/.env.panel` (fuera del repo git, en el mismo directorio)
3. Añade `--env-file .env.panel` al comando docker compose
4. En el bloque `finally`: borra `.env.panel` con `fs.unlink` (silencia el error si no existe)

El router `proyectos.deploy` descifra las variables con `descifrar` antes de llamar a `deployProyecto`. La lib de deploy recibe strings limpios — no conoce `node:crypto`.

---

## UI — tres vistas

### Dashboard `/`

**Antes:** `StatsBar` + `ClientSection` con `ProjectCard` para cada proyecto.

**Después:**

- Fila de contadores (total clientes / total proyectos / N running / N error) — componente `ResumenStats`
- Lista compacta por cliente: nombre del cliente + número de proyectos — sin cards detalladas
- Sección placeholder "Métricas de sistema" (vacía, con mensaje "Próximamente") — preparada para el siguiente spec
- Sin `ProjectCard` en el dashboard

### Proyectos `/proyectos`

**Antes:** tabla plana de todos los proyectos (creada hoy).

**Después:**

- Misma organización por cliente con `ClientSection` + `ProjectCard` (movidos desde el dashboard)
- Cada `ProjectCard` añade enlace **"Ver detalle →"** a `/proyectos/[id]`
- Botones de acción (start / stop / restart / deploy) permanecen en la card

### Detalle `/proyectos/[id]`

**Ruta:** `src/app/(panel)/proyectos/[id]/page.tsx`

Tres secciones:

**① Cabecera**

- Nombre del proyecto, badge del cliente, `StatusBadge` del estado
- Botones: Iniciar / Detener / Reiniciar / Deploy / toggle Auto-deploy

**② Información**

- Dominio, URL de repositorio, rama, lista de servicios con sus estados

**③ Variables de entorno**

- Tabla: Clave | Valor enmascarado (`••••••••`) | Acciones
- Acciones por fila: Revelar (👁) / Editar (✏) / Eliminar (🗑)
- Revelar: muestra el valor en claro durante 30 segundos, luego vuelve a `••••••••`
- Editar y eliminar: requieren confirmación inline antes de ejecutar
- Botón "Añadir variable" → formulario inline bajo la tabla (clave + valor)
- Componente cliente (`"use client"`) para manejar el estado de reveal/confirm

---

## Testing

| Capa                               | Tier           | Cobertura                                                                              |
| ---------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| `src/lib/crypto.ts`                | Core           | 100% — roundtrip cifrar/descifrar, IV único en cada cifrado, error en authTag inválido |
| `src/server/routers/variables.ts`  | Core           | 100% — crear/listar/actualizar/eliminar/revelar, proyecto inexistente                  |
| `src/components/` (VariablesPanel) | Important      | 80% — render con variables, reveal timeout, confirmaciones                             |
| Deploy modification                | Infrastructure | 0% (no se testa)                                                                       |

---

## Ficheros afectados

**Nuevos:**

- `prisma/migrations/XXXX_add_variables_entorno.sql` (generada por Prisma)
- `src/lib/crypto.ts`
- `src/server/routers/variables.ts`
- `src/app/(panel)/proyectos/[id]/page.tsx`
- `src/components/dashboard/VariablesPanel.tsx`

**Modificados:**

- `prisma/schema.prisma` — nuevo modelo + relación en `Proyecto`
- `src/env.ts` — nueva variable `ENCRYPTION_KEY`
- `src/server/routers/_app.ts` — registrar `variablesRouter`
- `src/lib/docker/deploy.ts` — parámetro `variables`, generación `.env.panel`, cleanup
- `src/server/routers/proyectos.ts` — `deploy` descifra variables antes de llamar a lib
- `src/app/(panel)/page.tsx` — simplificar dashboard
- `src/app/(panel)/proyectos/page.tsx` — reemplazar tabla por cards con enlace a detalle

**Sin cambios:**

- `src/components/dashboard/ProjectCard.tsx` — solo añadir enlace "Ver detalle"
- `src/components/dashboard/ClientSection.tsx` — sin cambios
