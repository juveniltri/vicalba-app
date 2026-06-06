# Gestión de Dominios — Spec de diseño

**Fecha:** 2026-06-06  
**Estado:** aprobado

---

## Contexto

El campo `dominio` ya existe en el modelo `Proyecto` y la config de Traefik se genera/escribe/elimina al crear/editar/eliminar un proyecto. Sin embargo, Traefik debe conectarse manualmente a la red del cliente para poder enrutar tráfico (`docker network connect cliente-<slug>-network traefik`). Además, no hay visibilidad del estado SSL del certificado emitido por Let's Encrypt.

Esta feature añade:

1. Conexión automática de Traefik a las redes de cliente al gestionar proyectos con dominio
2. Visualización del estado SSL en el detalle del proyecto

---

## Variables de entorno nuevas

```
TRAEFIK_CONTAINER_NAME=traefik        # nombre del contenedor Traefik en Docker
ACME_JSON_PATH=/var/vicalba/traefik/acme.json  # ruta al archivo de certificados
```

Ambas tienen valores por defecto. Solo hace falta definirlas si el nombre del contenedor o la ruta difieren del estándar.

---

## Arquitectura

```
src/lib/docker/traefik.ts    →   proyectosRouter (crear/editar/eliminar)
src/lib/ssl/acme.ts          →   proyectosRouter.estadoSSL
                                        ↓
                             /proyectos/[id]/page.tsx
                                        ↓
                             SSLBadge (componente)
```

---

## Capa de lógica

### `src/lib/docker/traefik.ts`

```typescript
export async function conectarTraefikARed(clienteSlug: string): Promise<void>;
export async function desconectarTraefikDeRed(
  clienteSlug: string,
): Promise<void>;
```

- Usa dockerode para encontrar el contenedor cuyo nombre coincide con `env.TRAEFIK_CONTAINER_NAME`
- `conectarTraefikARed`: obtiene la red `cliente-<slug>-network` con `docker.getNetwork(name)` y llama a `network.connect({ Container: containerId })`. Si el contenedor ya está conectado (error con mensaje `"already exists"`), absorbe el error silenciosamente
- `desconectarTraefikDeRed`: llama a `network.disconnect({ Container: containerId })`. Si no estaba conectado, absorbe el error

### `src/lib/ssl/acme.ts`

```typescript
export async function leerEstadoSSL(
  dominio: string,
): Promise<{ activo: boolean; expira: Date | null }>;
```

- Lee `env.ACME_JSON_PATH` con `fs.readFile`
- Si el archivo no existe o está malformado, devuelve `{ activo: false, expira: null }`
- Parsea la estructura de Traefik:
  ```json
  {
    "letsencrypt": {
      "Certificates": [
        { "domain": { "main": "example.com" }, "Store": "default" }
      ]
    }
  }
  ```
- Busca un certificado cuyo `domain.main` coincida con el dominio solicitado
- El campo de expiración no está directamente en `acme.json` (está en el cert X.509 codificado en base64). Para simplicidad: si el dominio está en la lista de certificados, `activo: true` y `expira: null`. Si se requiere la fecha exacta en el futuro, se puede decodificar el cert.

### Cambios en `proyectosRouter`

**`crear`** — si el proyecto tiene dominio, tras `escribirConfigTraefik`:

```typescript
await conectarTraefikARed(creado.cliente.slug);
```

**`editar`** — comparar dominio anterior vs nuevo:

- Si antes no había dominio y ahora sí → `conectarTraefikARed`
- Si antes había dominio y ahora no → `desconectarTraefikDeRed` solo si ningún otro proyecto del mismo cliente tiene dominio
- Si el dominio cambió (ambos no nulos) → no hay cambio de red (ya estaba conectada)

**`eliminar`** — si el proyecto tenía dominio:

```typescript
const otrosConDominio = await prisma.proyecto.count({
  where: {
    clienteId: proyecto.clienteId,
    dominio: { not: null },
    id: { not: input.id },
  },
});
if (otrosConDominio === 0) await desconectarTraefikDeRed(proyecto.cliente.slug);
```

### Nuevo procedure `proyectos.estadoSSL`

```typescript
estadoSSL: protectedProcedure
  .input(z.object({ dominio: z.string() }))
  .query(async ({ input }) => {
    return leerEstadoSSL(input.dominio);
  });
```

---

## UI

### `src/components/dashboard/SSLBadge.tsx`

Componente pequeño que recibe `{ activo: boolean; expira: Date | null }`:

```
● SSL activo        (verde, text-state-running)
○ SSL pendiente     (amarillo, text-state-deploying)
```

### `/proyectos/[id]/page.tsx`

En la sección "Información", bajo el campo Dominio, si el proyecto tiene dominio:

```tsx
{
  proyecto.dominio && (
    <SSLBadge
      estado={await api.proyectos.estadoSSL({ dominio: proyecto.dominio })}
    />
  );
}
```

Cargado directamente en el Server Component — sin polling, muestra el estado en cada carga de página.

---

## Testing

### Core — 100%

**`src/lib/docker/traefik.test.ts`**

- `conectarTraefikARed`: encuentra contenedor por nombre, llama a connect con la red correcta
- `conectarTraefikARed`: absorbe error si el contenedor ya estaba conectado
- `desconectarTraefikDeRed`: llama a disconnect correctamente
- `desconectarTraefikDeRed`: absorbe error si no estaba conectado

**`src/lib/ssl/acme.test.ts`**

- Devuelve `activo: true` si el dominio está en la lista de certificados
- Devuelve `activo: false` si el dominio no aparece
- Devuelve `activo: false` si `acme.json` no existe
- Devuelve `activo: false` si `acme.json` está malformado

**`src/server/routers/proyectos.test.ts`** — añadir casos:

- `crear` con dominio llama `conectarTraefikARed` después de `escribirConfigTraefik`
- `crear` sin dominio no llama `conectarTraefikARed`
- `editar` añadiendo dominio llama `conectarTraefikARed`
- `editar` quitando dominio (sin otros proyectos con dominio) llama `desconectarTraefikDeRed`
- `editar` quitando dominio (hay otros proyectos con dominio) no llama `desconectarTraefikDeRed`
- `eliminar` con dominio (último del cliente) llama `desconectarTraefikDeRed`
- `eliminar` con dominio (quedan otros con dominio) no llama `desconectarTraefikDeRed`
- `estadoSSL`: devuelve resultado de `leerEstadoSSL`

### Important — 80%

**`src/components/dashboard/SSLBadge.test.tsx`**

- Muestra "SSL activo" con clase correcta cuando `activo: true`
- Muestra "SSL pendiente" con clase correcta cuando `activo: false`

### Infrastructure — 0%

`src/app/(panel)/proyectos/[id]/page.tsx` — sin tests.

---

## Archivos afectados

| Acción | Fichero                                      |
| ------ | -------------------------------------------- |
| Crear  | `src/lib/docker/traefik.ts`                  |
| Crear  | `src/lib/docker/traefik.test.ts`             |
| Crear  | `src/lib/ssl/acme.ts`                        |
| Crear  | `src/lib/ssl/acme.test.ts`                   |
| Crear  | `src/components/dashboard/SSLBadge.tsx`      |
| Crear  | `src/components/dashboard/SSLBadge.test.tsx` |
| Editar | `src/server/routers/proyectos.ts`            |
| Editar | `src/server/routers/proyectos.test.ts`       |
| Editar | `src/app/(panel)/proyectos/[id]/page.tsx`    |
| Editar | `src/env.ts`                                 |
| Editar | `.env.production.example`                    |
