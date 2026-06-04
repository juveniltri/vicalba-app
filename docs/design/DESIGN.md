# Identidad Visual — vicalba-app

## Dirección: Command Line

Panel de control técnico que fusiona la estética del terminal con una UI moderna. El fondo casi negro (`#030712`) crea máximo contraste con el azul eléctrico primario, transmitiendo precisión y control. La tipografía monospace en el cuerpo refuerza el contexto de infraestructura sin sacrificar legibilidad. Es un dashboard que se siente como una herramienta, no como un producto de marketing.

---

## Paleta de colores

| Token | Hex | Uso |
|---|---|---|
| `primary-50`  | `#EFF6FF` | Fondos tintados sutiles, hover states en modo claro |
| `primary-100` | `#DBEAFE` | Backgrounds suaves en modo claro |
| `primary-300` | `#93C5FD` | Bordes activos, iconos secundarios |
| `primary-500` | `#1D4ED8` | Color principal — botones, links, elementos interactivos |
| `primary-700` | `#1E40AF` | Hover de botones primarios |
| `primary-900` | `#1E3A8A` | Texto sobre fondo claro, badges en modo claro |
| `accent`      | `#22D3EE` | CTAs secundarios, badges de estado "running", highlights de logs |
| `background`  | `#030712` | Fondo base de la app (modo oscuro) |
| `surface`     | `#0F172A` | Cards, modales, panels, sidebars |
| `border`      | `#1E293B` | Divisores, bordes de inputs, separadores de tabla |
| `text-primary`| `#F1F5F9` | Texto principal sobre fondo oscuro |
| `text-muted`  | `#64748B` | Subtítulos, placeholders, metadatos, timestamps |

### Modo claro (tokens que cambian)

| Token | Hex modo claro |
|---|---|
| `background`   | `#F8FAFC` |
| `surface`      | `#FFFFFF` |
| `border`       | `#E2E8F0` |
| `text-primary` | `#0F172A` |
| `text-muted`   | `#94A3B8` |

---

## Tipografía

| Rol | Fuente | Pesos | Uso |
|---|---|---|---|
| Display | Space Grotesk | 600, 700 | Títulos, nombres de proyecto, headers de sección |
| Body | JetBrains Mono | 400, 500, 600 | UI general, labels, descripciones, logs |

### Escala

| Nombre | rem | px aprox |
|---|---|---|
| `xs` | 0.75rem | 12px |
| `sm` | 0.875rem | 14px |
| `base` | 1rem | 16px |
| `lg` | 1.125rem | 18px |
| `xl` | 1.25rem | 20px |
| `2xl` | 1.5rem | 24px |
| `3xl` | 1.875rem | 30px |
| `4xl` | 2.25rem | 36px |

---

## Estilo de componentes

- **Border radius:** `3px` para todos los elementos — bordes sharp que evocan precisión técnica. Usar `4px` máximo en badges.
- **Sombras:** ninguna en modo oscuro (el contraste de superficie es suficiente). Sombra sutil `0 1px 3px rgba(0,0,0,0.4)` en modo claro.
- **Espaciado base:** múltiplos de `4px` — escala `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`.
- **Animaciones:** duración base `200ms`, ease `cubic-bezier(0.4, 0, 0.2, 1)`. Animar solo `opacity` y `transform`. Nunca animar `color` o `background-color` directamente.
- **Estados de servicio:**
  - `running` → badge accent (`#22D3EE`) con texto oscuro
  - `stopped` → badge `#475569` con texto `#94A3B8`
  - `error` → badge `#DC2626` con texto blanco
  - `deploying` → badge `#F59E0B` con texto oscuro + spinner

---

## NO hacer

- No usar fuentes sans-serif genéricas (Inter, Roboto, system-ui) en el cuerpo — rompe la coherencia monospace
- No añadir border-radius > 4px — la esquina sharp es parte de la identidad
- No usar colores cálidos como primario ni acento (excepto para estados de error/warning)
- No añadir gradientes en fondos — superficies planas únicamente
- No usar sombras con color en modo oscuro — solo sombras de opacidad
- No combinar Space Grotesk y JetBrains Mono en la misma línea de texto

---

## Próximos pasos

- `/frontend-design` — genera componentes con esta identidad como contexto
- `/tailwind-design-system` — implementa el design system completo en Tailwind v4
