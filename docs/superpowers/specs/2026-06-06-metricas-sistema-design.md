# Métricas de sistema — Spec de diseño

**Fecha:** 2026-06-06  
**Estado:** aprobado

---

## Contexto

El dashboard (`/`) tiene una sección "Métricas de sistema" con un placeholder `CPU · RAM · Disco — próximamente`. Este spec describe cómo reemplazarlo con datos reales de la VPS.

El panel corre en Docker en la misma VPS que gestiona. Para acceder a métricas del host (no del contenedor) se montan `/proc` y `/` del host como volúmenes de solo lectura.

---

## Arquitectura

Tres capas independientes:

```
docker-compose.yml   →   src/lib/system/metrics.ts   →   GET /api/system/metrics   →   <MetricasSistema />
  (volúmenes host)          (lectura /host/proc)            (JSON + auth)               (polling 5s)
```

---

## Capa 1 — Volúmenes en docker-compose.yml

Añadir al servicio `panel`:

```yaml
volumes:
  - /proc:/host/proc:ro # CPU + RAM del host
  - /:/hostroot:ro,rslave # Disco del host
```

Los tres volúmenes existentes se mantienen sin cambios.

---

## Capa 2 — `src/lib/system/metrics.ts`

Función exportada: `obtenerMetricas(): Promise<MetricasSistema>`

### CPU

- Lee `/host/proc/stat` (primera línea: agregado de todos los cores).
- Campos: `user nice system idle iowait irq softirq steal`.
- Calcula `total = suma de todos`, `ocioso = idle + iowait`.
- Cachea la lectura anterior en una variable de módulo (`let _prevCpu`).
- En la primera llamada, devuelve `os.loadavg()[0] / os.cpus().length * 100` como aproximación.
- En llamadas posteriores: `cpu% = (Δno-ocioso / Δtotal) * 100`.

### RAM

- Lee `/host/proc/meminfo`.
- Extrae `MemTotal` y `MemAvailable` (en kB).
- `usado = (MemTotal - MemAvailable) / 1024 / 1024` → GB.
- `total = MemTotal / 1024 / 1024` → GB.

### Disco

- Llama `fs.statfsSync('/hostroot')`.
- `total = bsize * blocks / 1e9` → GB.
- `usado = (bsize * blocks - bsize * bavail) / 1e9` → GB.

### Modo dev (sin volúmenes montados)

- Si `NODE_ENV !== 'production'` o si `/host/proc/stat` no existe, devuelve datos simulados fijos para que el componente funcione en local.

### Tipo de retorno

```ts
type MetricasSistema = {
  cpu: number; // 0-100
  ram: { usado: number; total: number; unidad: "GB" };
  disco: { usado: number; total: number; unidad: "GB" };
};
```

---

## Capa 3 — `src/app/api/system/metrics/route.ts`

- Método: `GET`.
- Auth: llama `auth()` — devuelve 401 si no hay sesión.
- Happy path: llama `obtenerMetricas()`, responde `200` con JSON.
- Error: si la lib lanza, responde `500` con `{ error: 'no disponible' }` — el componente muestra `—` sin romper el dashboard.

---

## Capa 4 — `src/components/metricas-sistema.tsx`

- `"use client"`.
- Estado: `metricas: MetricasSistema | null`, `cargando: boolean`.
- Al montar: fetch inmediato + `setInterval(fetch, 5000)`. Cleanup en el return del efecto.
- Primer render sin datos: muestra `—` en los valores (sin spinner — evita layout shift).
- Tres métricas con barra de progreso y etiqueta:
  - **CPU** — `34%`
  - **RAM** — `3.1 / 8.0 GB`
  - **Disco** — `48 / 100 GB`
- Colores semafóricos por porcentaje:
  - `< 70%` → `text-state-running` (cian — token existente)
  - `70–89%` → `text-state-deploying` (ámbar — token existente `#F59E0B`)
  - `≥ 90%` → `text-state-error` (rojo — token existente)

---

## Integración en dashboard

En `src/app/(panel)/page.tsx`, reemplazar:

```tsx
{
  /* Placeholder métricas */
}
<section>…</section>;
```

por:

```tsx
<MetricasSistema />
```

El componente gestiona su propio estado — el Server Component del dashboard no cambia en lógica.

---

## Testing

- `src/lib/system/metrics.ts` está en `src/lib/` → cobertura **100%** según la estrategia del proyecto.
- Tests unitarios con Vitest: mockear `fs.statfsSync` y las lecturas de fichero, verificar cálculos de CPU delta, RAM y disco.
- El componente `MetricasSistema` está en `src/components/` → cobertura **80%**.
- No se testea la API route (infraestructura).

---

## Archivos afectados

| Acción | Fichero                               |
| ------ | ------------------------------------- |
| Editar | `docker-compose.yml`                  |
| Crear  | `src/lib/system/metrics.ts`           |
| Crear  | `src/app/api/system/metrics/route.ts` |
| Crear  | `src/components/metricas-sistema.tsx` |
| Editar | `src/app/(panel)/page.tsx`            |
