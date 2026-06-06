# Historial de Deploys — Spec de diseño

**Fecha:** 2026-06-06  
**Estado:** aprobado

---

## Contexto

Actualmente el panel solo guarda el último deploy de cada proyecto (`ultimoDeployEn` + `ultimoDeployRama` en `Proyecto`). No hay registro histórico ni se captura el output de `docker compose up`. Esta feature añade un historial completo de deploys con output para diagnóstico.

Los deploys se disparan desde dos rutas independientes:

- `proyectosRouter.deploy` (tRPC) — desde el botón "Deploy" del panel
- `POST /api/webhooks/github` — auto-deploy por webhook

Ambas llaman a `deployProyecto()` directamente.

---

## Arquitectura

```
prisma/schema.prisma         →   src/lib/docker/deploys.ts      →   callers
  (modelo Deploy + enum)          (ejecutarDeploy — orquesta)        (webhook + tRPC)
                                                                         ↓
                                                               proyectosRouter.listarDeploys
                                                                         ↓
                                                               /proyectos/[id] — sección UI
```

---

## Modelo de datos

### Nuevo enum `ResultadoDeploy`

```prisma
enum ResultadoDeploy {
  en_curso
  exito
  error
}
```

### Nuevo modelo `Deploy`

```prisma
model Deploy {
  id           String          @id @default(cuid())
  proyecto     Proyecto        @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  proyectoId   String
  rama         String
  resultado    ResultadoDeploy @default(en_curso)
  output       String?
  iniciadoEn   DateTime        @default(now())
  finalizadoEn DateTime?

  @@index([proyectoId, iniciadoEn(sort: Desc)])
}
```

### Cambio en `Proyecto`

Añadir relación:

```prisma
deploys  Deploy[]
```

`onDelete: Cascade` — eliminar el proyecto elimina todos sus deploys.  
El índice compuesto `[proyectoId, iniciadoEn DESC]` optimiza la query de listado.

---

## Capa de lógica — `src/lib/docker/deploys.ts`

### Cambio en `deployProyecto`

`deployProyecto()` pasa de retornar `void` a retornar `Promise<string>` con el stdout+stderr concatenados del proceso `docker compose up`.

Implementación: `execFileAsync` devuelve `{ stdout, stderr }` en éxito. En error lanza un objeto con `.stdout` y `.stderr` disponibles. En ambos casos concatenar `stdout + "\n" + stderr`. El bloque `try/finally` existente en `deployProyecto` se ajusta para capturar y retornar el output antes de re-lanzar en caso de error.

### Nueva función `ejecutarDeploy`

```typescript
export async function ejecutarDeploy(params: {
  proyectoId: string;
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<{ resultado: "exito" | "error"; output: string }>;
```

Flujo:

1. `prisma.deploy.create({ proyectoId, rama, resultado: 'en_curso' })`
2. Llama a `deployProyecto(params)` dentro de try/catch
3. En éxito: `prisma.deploy.update({ resultado: 'exito', output, finalizadoEn: new Date() })`
4. En error: `prisma.deploy.update({ resultado: 'error', output: mensaje_error, finalizadoEn: new Date() })`
5. Retorna `{ resultado, output }` — los callers mantienen su lógica de actualizar `proyecto.estado`

---

## Callers actualizados

### `src/app/api/webhooks/github/route.ts`

Reemplaza la llamada a `deployProyecto()` por `ejecutarDeploy()`. El bloque try/catch existente se elimina: `ejecutarDeploy` nunca lanza — absorbe el error, lo guarda en el registro `Deploy` y retorna `{ resultado: 'error', output }`. El caller actualiza `proyecto.estado: 'running'` si `resultado === 'exito'` o `proyecto.estado: 'error'` si `resultado === 'error'`.

### `src/server/routers/proyectos.ts` — procedure `deploy`

Igual: reemplaza `deployProyecto()` por `ejecutarDeploy()`.

---

## API — nuevo procedure tRPC

En `proyectosRouter`:

```typescript
listarDeploys: protectedProcedure
  .input(z.object({ proyectoId: z.string() }))
  .query(async ({ input }) => {
    return prisma.deploy.findMany({
      where: { proyectoId: input.proyectoId },
      orderBy: { iniciadoEn: "desc" },
      take: 20,
      select: {
        id: true,
        rama: true,
        resultado: true,
        output: true,
        iniciadoEn: true,
        finalizadoEn: true,
      },
    });
  });
```

Devuelve los últimos 20 deploys ordenados por fecha descendente.

---

## UI — sección en `/proyectos/[id]`

Nueva sección "Historial de deploys" en `src/app/(panel)/proyectos/[id]/page.tsx`, debajo de Variables de entorno.

### Cada fila muestra

- **Badge de resultado**: `exito` → `text-state-running` (cian), `error` → `text-state-error` (rojo), `en_curso` → `text-state-deploying` (ámbar)
- **Rama** — nombre de la rama desplegada
- **Fecha relativa** — "hace 3h" usando `formatHace()` ya existente
- **Duración** — `(finalizadoEn - iniciadoEn)` en segundos; "—" si `en_curso`
- **Output expandible** — elemento `<details>/<summary>` nativo del navegador, sin JS extra. El summary muestra "Ver output", el contenido es el stdout/stderr en `<pre>` con scroll horizontal

### Estado vacío

Si no hay deploys: "Sin deploys registrados."

### Componente

`src/components/dashboard/HistorialDeploys.tsx` — Server Component, recibe los deploys como prop. No necesita estado cliente.

---

## Testing

- `src/lib/docker/deploys.ts` está en `src/lib/` → cobertura **100%**
- Tests unitarios con Vitest: mockear `prisma` y `deployProyecto`, verificar que `ejecutarDeploy` crea/actualiza el registro correctamente en éxito y en error
- `proyectosRouter.listarDeploys` está en `src/server/routers/` → cobertura **100%**
- `HistorialDeploys` está en `src/components/` → cobertura **80%**
- La migración de Prisma no se testa (infraestructura)

---

## Archivos afectados

| Acción | Fichero                                                                                 |
| ------ | --------------------------------------------------------------------------------------- |
| Editar | `prisma/schema.prisma`                                                                  |
| Crear  | `prisma/migrations/<timestamp>_add_deploy_history/` (generada por `prisma migrate dev`) |
| Editar | `src/lib/docker/deploy.ts`                                                              |
| Crear  | `src/lib/docker/deploys.ts`                                                             |
| Editar | `src/server/routers/proyectos.ts`                                                       |
| Editar | `src/app/api/webhooks/github/route.ts`                                                  |
| Crear  | `src/components/dashboard/HistorialDeploys.tsx`                                         |
| Crear  | `src/components/dashboard/HistorialDeploys.test.tsx`                                    |
| Editar | `src/app/(panel)/proyectos/[id]/page.tsx`                                               |
