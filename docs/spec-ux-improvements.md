# Spec — feature/ux-improvements

Feature branch para mejoras de UX, corrección del badge SSL y modernización
de la UI con soporte dark/light theme.

---

## 0. Bug: SSL badge siempre muestra "pendiente"

**Causa probable:** `leerEstadoSSL` busca el dominio como clave directa en
`acme.json`. Traefik almacena los certs bajo el resolver (`letsencrypt`) y
cada dominio aparece en `Certificates[].Domain.Main`. Si el matching falla,
devuelve `pending` aunque el cert exista.

**Ficheros afectados:** `src/lib/ssl/acme.ts`

**Fix:** revisar Zod schema + lógica de búsqueda. Los tests existentes deben
seguir pasando; añadir casos con la estructura real del `acme.json` de Traefik.

**Impacto:** desbloquea el botón de URL (punto 1).

---

## 1. Botón "Abrir URL" en proyectos

**Dónde:**

- Dashboard → `ProjectCard`: icono de enlace externo junto al dominio
- Detalle de proyecto: botón en la cabecera junto a Iniciar/Detener

**Lógica:**

```
sin dominio         → no se renderiza
SSL activo          → href = https://{dominio}
SSL pendiente/error → href = http://{dominio}
```

Abre en nueva pestaña (`target="_blank" rel="noopener noreferrer"`).
Solo icono + tooltip "Abrir en el navegador", sin texto largo.

---

## 2. File Manager — explorador modal

**Cómo se abre:** botón "Explorar" en la fila del volumen en `VolumenesPanel`.

**Layout (85% pantalla):**

```
┌─────────────────────────────────────────────────────────────┐
│ Explorador — galeria          /fotos/2024/         [✕]      │
├─────────────────────────────────────────────────────────────┤
│  / > fotos > 2024                    [+ Carpeta] [↑ Subir]  │
├─────────────────────────────────────────────────────────────┤
│ □  📁 eventos/           —          —                       │
│ □  📄 banner.png         2.1 MB     hace 3 días             │
│ □  📄 portada.jpg        890 KB     ayer                    │
├─────────────────────────────────────────────────────────────┤
│ 2 seleccionados              [↓ Descargar ZIP]  [🗑 Eliminar]│
└─────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**

- Navegación por breadcrumb y click en carpetas
- Selección múltiple con checkbox (incluyendo "seleccionar todos")
- Subida múltiple: selector de ficheros + drag & drop sobre el listado
- Descargar seleccionados → ZIP generado en servidor con `fflate`
- Crear carpeta: click en "+ Carpeta" → input inline → Enter confirma
- Eliminar seleccionados con confirm dialog
- Sin preview de ficheros

**Backend a añadir:**

`GET /api/volumes/[id]/files/download?path=dir&files=foto.jpg,banner.png`

- Genera ZIP con `fflate` (pure JS, sin deps nativas, sin CVEs conocidos)
- Devuelve `Content-Type: application/zip`
- Nombre del ZIP: `{volumen}-{timestamp}.zip`
- Misma protección `safeResolvePath` que el resto de la API

`POST /api/volumes/[id]/files/mkdir`

- Body: `{ path: "fotos/2024", nombre: "eventos" }`
- `mkdir(safeResolvePath(base, path/nombre), { recursive: true })`
- 409 si ya existe

**Cobertura:** tests para los dos endpoints nuevos (100% routers no aplica
aquí porque están en `src/app/api/`, que está excluido de thresholds).

---

## 3. Panel de logs mejorado

**Estado actual:** panel inline pequeño en detalle de proyecto.
**Cambio:** botón "⤢ Expandir" en la cabecera del panel existente.

**Modal (80% pantalla):**

```
┌─────────────────────────────────────────────────────────────┐
│ Logs — web-app   [ALL][ERR][WARN][INFO][DEBUG]  [⊞ TS] [✕] │
├─────────────────────────────────────────────────────────────┤
│ 14:32:01  INFO   Server started on port 3000                │
│ 14:32:05  WARN   Missing optional env var SMTP_HOST         │
│ 14:32:10  ERROR  Connection refused: redis:6379             │
│ ...                                                         │
├─────────────────────────────────────────────────────────────┤
│ [Auto-scroll ✓]                            [Limpiar buffer] │
└─────────────────────────────────────────────────────────────┘
```

**Comportamiento:**

- El panel inline **permanece visible** mientras el modal está abierto
- Cerrar modal → desaparece el modal, el panel inline sigue ahí
- El modal instancia su propio `useContainerLogs` — ambos reciben el stream
  de forma independiente

**Controles:**

- `[ALL][ERR][WARN][INFO][DEBUG]` — filtro de nivel aplicado en el render
  - Niveles Pino: 60=fatal, 50=error, 40=warn, 30=info, 20=debug, 10=trace
  - Líneas no-JSON (output crudo del contenedor) → siempre visibles
- `[TS]` toggle — oculta/muestra prefijo de timestamp en el render (los datos
  llegan igual del servidor)
- `[Limpiar buffer]` — vacía el array local sin resetear el stream SSE
- Auto-scroll — mantener comportamiento actual

---

## 4. UI — Dark/Light theme

**Principio:** `src/styles/tokens.css` es la única fuente de verdad.
Cero colores hardcodeados en componentes.

**Implementación:**

- `<html data-theme="dark">` por defecto
- Toggle en esquina inferior del sidebar: botón sol/luna (SVG inline, sin lib)
- Persistir preferencia en `localStorage` con key `vicalba-theme`
- CSS: variables en `:root[data-theme="dark"]` y `:root[data-theme="light"]`
- Respetar `prefers-color-scheme` solo en la carga inicial si no hay valor
  guardado en localStorage

**Paleta dark (default):**

| Token               | Valor     | Uso                           |
| ------------------- | --------- | ----------------------------- |
| `--bg-base`         | `#0f1117` | Fondo de página               |
| `--bg-surface`      | `#1a1d27` | Cards, sidebar                |
| `--bg-elevated`     | `#22263a` | Inputs, hover rows            |
| `--border`          | `#2a2d3a` | Bordes y separadores          |
| `--text-primary`    | `#e8eaf6` | Texto principal               |
| `--text-muted`      | `#8b8fa8` | Labels, metadatos             |
| `--accent`          | `#6366f1` | Botón primario, links activos |
| `--accent-hover`    | `#4f46e5` | Hover de accent               |
| `--success`         | `#22c55e` | Estado running, SSL ok        |
| `--warning`         | `#f59e0b` | Estado deploying, SSL pending |
| `--error`           | `#ef4444` | Estado error, acciones danger |
| `--deploying-pulse` | animación | Pulse en badge deploying      |

**Paleta light:**

| Token                             | Valor            |
| --------------------------------- | ---------------- |
| `--bg-base`                       | `#f1f5f9`        |
| `--bg-surface`                    | `#ffffff`        |
| `--bg-elevated`                   | `#f8fafc`        |
| `--border`                        | `#e2e8f0`        |
| `--text-primary`                  | `#0f172a`        |
| `--text-muted`                    | `#64748b`        |
| `--accent`                        | `#6366f1`        |
| `--accent-hover`                  | `#4f46e5`        |
| `--success`/`--warning`/`--error` | iguales que dark |

**Componentes a restylear** (sin añadir componentes nuevos):

1. `tokens.css` — nueva paleta completa
2. Sidebar — fondo `--bg-surface`, item activo con `--accent`, toggle theme
3. `ProjectCard` — fondo `--bg-surface`, sombra sutil, badge de estado
   prominente con color según `--success/--warning/--error`
4. Tablas (clientes, usuarios) — header `--bg-elevated`, hover row, border
5. Botones — 3 variantes: primary (`--accent` filled), secondary (ghost +
   border), danger (`--error`)
6. Inputs/forms — border `--border`, focus ring `--accent`, bg `--bg-elevated`
7. Badges SSL/deploy — pill style con color semántico
8. Modales (logs, file manager, confirmaciones) — bg `--bg-surface`,
   backdrop `rgba(0,0,0,0.6)`

---

## Orden de implementación

```
1. Bug SSL fix     → pequeño, desbloquea el botón URL
2. Botón URL       → depende del fix SSL
3. Logs modal      → independiente, tamaño medio
4. File manager    → 2 endpoints nuevos + componente modal
5. UI theme        → al final, envuelve todo lo anterior con el nuevo diseño
```

## Dependencias nuevas

| Paquete  | Versión | Uso                     | Motivo de elección              |
| -------- | ------- | ----------------------- | ------------------------------- |
| `fflate` | `^0.8`  | Generar ZIP en servidor | Pure JS, 40KB, sin CVEs, rápido |
