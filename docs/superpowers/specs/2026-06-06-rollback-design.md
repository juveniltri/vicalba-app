# Rollback de Deploys — Spec de diseño

**Fecha:** 2026-06-06  
**Estado:** aprobado

---

## Contexto

El historial de deploys registra cada deploy en la tabla `Deploy`. Sin embargo, no se guarda el SHA de git en el que se desplegó, lo que impide volver a un estado anterior exacto. Esta feature añade la capacidad de hacer rollback a cualquier deploy exitoso del historial, redesplegando el commit exacto que se usó en ese momento.

---

## Arquitectura

```
prisma/schema.prisma         →   src/lib/docker/deploy.ts       →   src/lib/docker/deploys.ts
  (Deploy.sha: String?)           (deployProyecto — acepta sha?)       (ejecutarDeploy — guarda sha)
                                                                              ↓
                                                                   proyectosRouter.rollback
                                                                              ↓
                                                                   actions.ts (rollbackAction)
                                                                              ↓
                                                                   HistorialDeploys — botón Rollback
```

---

## Modelo de datos

### Cambio en `Deploy`

Añadir campo opcional `sha`:

```prisma
model Deploy {
  id           String          @id @default(cuid())
  proyecto     Proyecto        @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  proyectoId   String
  rama         String
  sha          String?
  resultado    ResultadoDeploy @default(en_curso)
  output       String?
  iniciadoEn   DateTime        @default(now())
  finalizadoEn DateTime?

  @@index([proyectoId, iniciadoEn(sort: Desc)])
}
```

Los deploys históricos sin SHA simplemente no mostrarán el botón de rollback en la UI.

---

## Capa de lógica

### Cambio en `deployProyecto` — `src/lib/docker/deploy.ts`

**Nuevos aspectos:**

1. Acepta `sha?: string` en el objeto de params.
2. Si `sha` está presente: ejecuta `git fetch origin` para asegurar que el commit está disponible localmente, luego `git checkout <sha>`. Si no está presente: comportamiento actual (`git checkout <rama>` + `git pull`).
3. Captura el SHA real tras el checkout con `git rev-parse HEAD`.
4. Cambia el tipo de retorno de `Promise<string>` a `Promise<{ output: string; sha: string }>`.

```typescript
export async function deployProyecto(params: {
  repoUrl: string;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<{ output: string; sha: string }>;
```

Flujo interno:

```typescript
if (params.sha) {
  await execFileAsync("git", ["-C", repoDir, "fetch", "origin"]);
  await execFileAsync("git", ["-C", repoDir, "checkout", params.sha]);
} else {
  await execFileAsync("git", ["-C", repoDir, "checkout", params.rama]);
  await execFileAsync("git", ["-C", repoDir, "pull"]);
}

const { stdout: shaRaw } = await execFileAsync("git", [
  "-C",
  repoDir,
  "rev-parse",
  "HEAD",
]);
const sha = shaRaw.trim();

// ... docker compose up ...
return { output, sha };
```

### Cambio en `ejecutarDeploy` — `src/lib/docker/deploys.ts`

- Acepta `sha?: string` en params, lo pasa a `deployProyecto`.
- En éxito: guarda el SHA retornado por `deployProyecto` en el registro `Deploy`.

```typescript
export async function ejecutarDeploy(params: {
  proyectoId: string;
  repoUrl: string;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<{ resultado: "exito" | "error"; output: string }>;
```

En éxito:

```typescript
const { output, sha } = await deployProyecto(deployParams);
await prisma.deploy
  .update({
    where: { id: registro.id },
    data: { resultado: "exito", output, sha, finalizadoEn: new Date() },
  })
  .catch(() => {});
```

El contrato never-throws se mantiene sin cambios.

### Nuevo procedure `rollback` — `src/server/routers/proyectos.ts`

```typescript
rollback: protectedProcedure
  .input(z.object({ deployId: z.string() }))
  .mutation(async ({ input }) => {
    const deploy = await prisma.deploy.findUnique({
      where: { id: input.deployId },
    });
    if (!deploy) throw new TRPCError({ code: "NOT_FOUND" });
    if (deploy.resultado !== "exito" || !deploy.sha)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Solo se puede hacer rollback de deploys exitosos con SHA registrado",
      });

    const proyecto = await findProyectoOrThrow(deploy.proyectoId);
    if (proyecto.estado === "deploying")
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto ya está en proceso de deploy",
      });

    await prisma.proyecto.update({
      where: { id: deploy.proyectoId },
      data: { estado: "deploying" },
    });

    const variablesDB = await prisma.variableEntorno.findMany({
      where: { proyectoId: deploy.proyectoId },
    });
    const variables = variablesDB.map((v) => ({
      clave: v.clave,
      valor: descifrar(v.valorCifrado, v.iv, v.authTag),
    }));

    const { resultado } = await ejecutarDeploy({
      proyectoId: deploy.proyectoId,
      repoUrl: proyecto.repositorioUrl!,
      rama: deploy.rama,
      sha: deploy.sha,
      clienteSlug: proyecto.cliente.slug,
      proyectoNombre: proyecto.nombre,
      servicios: proyecto.servicios.map((s) => s.nombre),
      variables,
    });

    return prisma.proyecto.update({
      where: { id: deploy.proyectoId },
      data: {
        estado: resultado === "exito" ? "running" : "error",
        ...(resultado === "exito"
          ? { ultimoDeployEn: new Date(), ultimoDeployRama: deploy.rama }
          : {}),
      },
    });
  });
```

Las variables se toman del estado actual del proyecto — no se versionan junto al código.

---

## UI

### `src/app/(panel)/actions.ts`

Nueva Server Action:

```typescript
export async function rollbackAction(deployId: string) {
  const api = await createServerCaller();
  await api.proyectos.rollback({ deployId });
  revalidatePath(`/proyectos/[id]`, "page");
}
```

### `src/components/dashboard/HistorialDeploys.tsx`

- Recibe prop adicional `isDeploying: boolean`.
- En cada fila con `resultado === "exito"` y `sha !== null`, renderiza un botón "Rollback" dentro de un `<form>` con `action={() => rollbackAction(d.id)}`.
- El botón se deshabilita cuando `isDeploying === true`.

```
● exito   main   hace 2h   34s   [Ver output]   [Rollback]
● error   main   hace 3h   12s   [Ver output]
● exito   main   hace 5h   28s   [Ver output]   [Rollback]
```

### `src/app/(panel)/proyectos/[id]/page.tsx`

Pasa `isDeploying` a `HistorialDeploys`:

```tsx
<HistorialDeploys deploys={deploys} isDeploying={isDeploying} />
```

---

## Testing

### Core — 100%

**`src/lib/docker/deploy.test.ts`** — actualizar tests existentes para nuevo tipo de retorno `{ output, sha }`, añadir:

- Path sin SHA: hace checkout de rama + pull, retorna sha capturado
- Path con SHA: hace fetch + checkout de sha, retorna ese sha

**`src/lib/docker/deploys.test.ts`** — añadir:

- SHA retornado por deployProyecto se guarda en el registro Deploy en éxito
- SHA se pasa a deployProyecto cuando se recibe en params

**`src/server/routers/proyectos.test.ts`** — tests para `rollback`:

- NOT_FOUND si el deploy no existe
- BAD_REQUEST si resultado !== "exito"
- BAD_REQUEST si sha es null
- CONFLICT si proyecto.estado === "deploying"
- Éxito: llama a ejecutarDeploy con sha, actualiza estado a "running"
- Error: actualiza estado a "error"
- Requiere autenticación

### Important — 80%

**`src/components/dashboard/HistorialDeploys.test.tsx`** — añadir:

- Mock de `@/app/(panel)/actions`: `vi.mock("@/app/(panel)/actions", () => ({ rollbackAction: vi.fn() }))`
- Botón Rollback aparece en deploy exitoso con sha
- Botón Rollback NO aparece si sha es null
- Botón Rollback NO aparece si resultado !== "exito"
- Botón Rollback deshabilitado cuando `isDeploying === true`

### Infrastructure — 0%

`src/app/(panel)/actions.ts` y `src/app/(panel)/proyectos/[id]/page.tsx` — sin tests.

---

## Archivos afectados

| Acción | Fichero                                              |
| ------ | ---------------------------------------------------- |
| Editar | `prisma/schema.prisma`                               |
| Crear  | `prisma/migrations/<timestamp>_add_deploy_sha/`      |
| Editar | `src/lib/docker/deploy.ts`                           |
| Editar | `src/lib/docker/deploy.test.ts`                      |
| Editar | `src/lib/docker/deploys.ts`                          |
| Editar | `src/lib/docker/deploys.test.ts`                     |
| Editar | `src/server/routers/proyectos.ts`                    |
| Editar | `src/server/routers/proyectos.test.ts`               |
| Editar | `src/app/(panel)/actions.ts`                         |
| Editar | `src/components/dashboard/HistorialDeploys.tsx`      |
| Editar | `src/components/dashboard/HistorialDeploys.test.tsx` |
| Editar | `src/app/(panel)/proyectos/[id]/page.tsx`            |
