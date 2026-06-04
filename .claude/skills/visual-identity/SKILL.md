---
name: visual-identity
description: Define la identidad visual de un proyecto mediante entrevista guiada y preview visual interactivo en el navegador. Genera 3 direcciones de diseño renderizadas como HTML, el usuario elige visualmente, y produce DESIGN.md, tokens.css y tailwind.config.ts. Invocar antes de usar /frontend-design o /tailwind-design-system.
metadata:
  type: skill
---

# Skill: visual-identity

Defines la identidad visual del proyecto. Entrevistas al usuario, propones 3 direcciones de diseño radicalmente distintas, las renderizas en un preview interactivo en el navegador, el usuario elige visualmente, y produces los artefactos finales listos para usar.

---

## Paso 1 — Contexto del proyecto

Lee `PROJECT.md` si existe. Extrae:

- `nombre_proyecto` y `cliente`
- `descripcion` — naturaleza del negocio
- `publico_objetivo`
- Sección `Diseño y UI` — paleta, tipografía, referencias si ya hay algo anotado

Si no existe PROJECT.md, pregunta: "¿Para qué tipo de negocio o producto es este diseño?"

---

## Paso 2 — Entrevista (una pregunta por mensaje)

1. **Personalidad** — "Describe la marca con 3-5 adjetivos. Ej: moderna, cercana, profesional, atrevida, minimalista."

2. **Color** — "¿Hay algún color que la marca ya use, quiera evitar, o que sea imprescindible?"

3. **Referencias** — "¿Alguna web, app o marca cuyo estilo visual te guste? Pueden ser de cualquier sector."

4. **Público** — "¿El usuario final es más formal (profesionales, empresas) o casual (consumidores, jóvenes)?"

5. **Modo** — "¿Tema claro, oscuro, o ambos?"

Con estas respuestas más el PROJECT.md tienes suficiente para proponer las 3 direcciones.

---

## Paso 3 — Definir 3 direcciones

Diseña 3 direcciones **radicalmente distintas** — no variaciones de la misma idea. Para cada una:

- **Nombre y concepto** — una frase que capture la esencia (ej: "Lujo oscuro", "Editorial limpio", "Vibrante y cercano")
- **Paleta**:
  - `primary-500`: color principal + 5 variantes (50, 100, 300, 500, 700, 900) como hexadecimales reales
  - `accent`: color de acción / CTA
  - `background`: fondo base
  - `surface`: fondo de cards y panels
  - `text-primary` y `text-muted`
  - `border`
- **Tipografía** (fuentes de Google Fonts):
  - `font-display`: para títulos — elige algo con carácter, no Inter ni Roboto
  - `font-body`: para texto corrido — legible, complementaria al display
- **Estilo**:
  - `radius`: sharp (0-2px) / medium (6-8px) / rounded (12-16px) / pill (9999px)
  - `shadow`: none / soft / dramatic
  - `density`: compact / comfortable / spacious

---

## Paso 4 — Generar el preview HTML

Genera el fichero `design-preview.html` en la raíz del proyecto.

### Requisitos del HTML

- **Completamente autocontenido** — todo CSS inline, fuentes desde Google Fonts con `<link preconnect>`
- **Sin frameworks** — HTML + CSS + JS vanilla puro
- **Responsive** — 3 columnas en desktop, 1 en mobile

### Estructura visual

**Cabecera del preview:**

```
[Nombre del proyecto] — Elige tu dirección visual
Haz clic en la tarjeta que mejor representa tu marca
```

**3 tarjetas** (una por dirección), cada una mostrando con los colores y fuentes REALES:

1. **Header de la tarjeta** — fondo con `primary-500`, texto en blanco: nombre de la dirección + concepto en una línea
2. **Paleta** — swatches de colores con su hex debajo (primary 50→900, accent, surface, background)
3. **Tipografía** — con las fuentes reales importadas:
   - H1 (font-display, 32px)
   - H2 (font-display, 24px)
   - Párrafo (font-body, 16px, 2 líneas de lorem ipsum)
   - Caption (font-body, 12px, text-muted)
4. **Componentes de muestra** sobre el `background` real:
   - Botón primario (primary-500, radius correcto)
   - Botón outline
   - Card con surface color: título, texto, badge y CTA
   - Input con label y placeholder
5. **Botón "Elegir esta dirección"** en la parte inferior

### Comportamiento de selección

Al hacer clic en una tarjeta o en su botón:

- La tarjeta seleccionada recibe un ring visible (3px solid primary-500 de esa dirección) y un ✓ en la esquina
- Las otras dos tarjetas se atenúan (opacity 0.4)
- Aparece un banner fijo en la parte superior: "✓ Dirección elegida: [Nombre]. Vuelve a Claude y escríbeme el número (1, 2 o 3)."
- El banner tiene fondo oscuro con el nombre de la dirección

### Calidad visual del propio preview

El marco del preview (no las tarjetas) debe tener buen diseño:

- Fondo: `#0f0f0f` si todas las direcciones son dark, `#f0f0f0` si son light, `#1a1a1a` si hay mix
- Tipografía del marco: system-ui, neutro
- Las tarjetas tienen sombra sutil `box-shadow: 0 4px 24px rgba(0,0,0,0.12)`
- Hover en tarjeta: `transform: translateY(-4px)`, transición 200ms
- El preview no debe parecer generado por IA — cuida los detalles

### Abrir en el navegador

Tras generar el fichero, ejecuta:

```bash
open design-preview.html
```

Di al usuario:

> "Preview abierto en tu navegador con las 3 direcciones. Haz clic en la que más te guste y dime el número o nombre para continuar."

---

## Paso 5 — Refinamiento (opcional)

Cuando el usuario elige, pregunta:

> "¿Quieres ajustar algo de la dirección elegida? Ej: 'el primario más oscuro', 'tipografía más serif', 'más redondez en los componentes'."

- Si hay ajustes: regenera `design-preview.html` mostrando solo la dirección elegida con los cambios aplicados, vuelve a abrirlo.
- Si no hay ajustes: continúa al Paso 6.

---

## Paso 6 — Artefactos finales

### `docs/design/DESIGN.md`

```markdown
# Identidad Visual — [Nombre del Proyecto]

## Dirección: [Nombre]

[Concepto en 2-3 frases. Por qué esta dirección encaja con la marca y el público.]

## Paleta de colores

| Token        | Hex     | Uso                                  |
| ------------ | ------- | ------------------------------------ |
| primary-50   | #XXXXXX | Fondos tintados, hover states        |
| primary-100  | #XXXXXX | Backgrounds sutiles                  |
| primary-300  | #XXXXXX | Bordes activos, iconos               |
| primary-500  | #XXXXXX | Color principal, botones, links      |
| primary-700  | #XXXXXX | Hover de botones                     |
| primary-900  | #XXXXXX | Texto sobre fondo claro              |
| accent       | #XXXXXX | CTAs secundarios, badges, highlights |
| background   | #XXXXXX | Fondo base de la app                 |
| surface      | #XXXXXX | Cards, modales, panels               |
| border       | #XXXXXX | Divisores y bordes de input          |
| text-primary | #XXXXXX | Texto principal                      |
| text-muted   | #XXXXXX | Subtítulos, placeholders, captions   |

## Tipografía

| Rol     | Fuente   | Pesos         | Uso          |
| ------- | -------- | ------------- | ------------ |
| Display | [Fuente] | 700, 800      | H1, H2, hero |
| Body    | [Fuente] | 400, 500, 600 | UI, párrafos |

### Escala

| Nombre | rem      | px aprox |
| ------ | -------- | -------- |
| xs     | 0.75rem  | 12px     |
| sm     | 0.875rem | 14px     |
| base   | 1rem     | 16px     |
| lg     | 1.125rem | 18px     |
| xl     | 1.25rem  | 20px     |
| 2xl    | 1.5rem   | 24px     |
| 3xl    | 1.875rem | 30px     |
| 4xl    | 2.25rem  | 36px     |

## Estilo de componentes

- **Border radius:** [valor] — [cuándo usar cada variante]
- **Sombras:** [estilo] — [cuándo usar]
- **Espaciado base:** [valor] — [escala múltiplo de X]
- **Animaciones:** duración base 250ms, ease `cubic-bezier(0.4,0,0.2,1)` — animar opacidad y transform, nunca color directamente

## NO hacer

- [Cosas a evitar extraídas de la entrevista y el concepto elegido]
- Nunca mezclar las fuentes de otras direcciones descartadas
- [Restricciones específicas del proyecto]

## Próximos pasos

- `/frontend-design` — genera componentes con esta identidad como contexto
- `/tailwind-design-system` — implementa el design system completo en Tailwind v4
```

### `src/styles/tokens.css`

```css
/* ─── Design Tokens — [Nombre del Proyecto] ─────────────────────────────────
   Generado por /visual-identity. Editar aquí, nunca hardcodear valores en componentes.
   ─────────────────────────────────────────────────────────────────────────── */

@import url("https://fonts.googleapis.com/css2?family=[FontDisplay]:[pesos]&family=[FontBody]:[pesos]&display=swap");

:root {
  /* Colores — Primary */
  --color-primary-50: [hex];
  --color-primary-100: [hex];
  --color-primary-300: [hex];
  --color-primary-500: [hex];
  --color-primary-700: [hex];
  --color-primary-900: [hex];

  /* Colores — Semánticos */
  --color-accent: [hex];
  --color-background: [hex];
  --color-surface: [hex];
  --color-border: [hex];

  /* Colores — Texto */
  --color-text-primary: [hex];
  --color-text-muted: [hex];

  /* Tipografía */
  --font-display: "[FontDisplay]", serif;
  --font-body: "[FontBody]", sans-serif;

  /* Escala tipográfica */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;

  /* Componentes */
  --radius-sm: [valor];
  --radius-md: [valor];
  --radius-lg: [valor];
  --radius-full: 9999px;

  --shadow-soft: [valor];
  --shadow-dramatic: [valor];

  /* Espaciado */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Animaciones */
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### `tailwind.config.ts` (solo si el proyecto usa Tailwind)

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "var(--color-primary-50)",
          100: "var(--color-primary-100)",
          300: "var(--color-primary-300)",
          500: "var(--color-primary-500)",
          700: "var(--color-primary-700)",
          900: "var(--color-primary-900)",
        },
        accent: "var(--color-accent)",
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        "text-primary": "var(--color-text-primary)",
        "text-muted": "var(--color-text-muted)",
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        dramatic: "var(--shadow-dramatic)",
      },
      transitionDuration: {
        fast: "150ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        default: "var(--ease-default)",
        spring: "var(--ease-spring)",
      },
    },
  },
} satisfies Config;
```

---

## Paso 7 — Cierre

1. Borra `design-preview.html` de la raíz — era temporal
2. Actualiza la sección `## Diseño y UI` del `PROJECT.md` con referencia a `docs/design/DESIGN.md`
3. Di al usuario:
   > "Identidad visual lista en `docs/design/DESIGN.md`. Tokens en `src/styles/tokens.css`.
   >
   > - Para crear componentes: `/frontend-design`
   > - Para el design system completo en Tailwind: `/tailwind-design-system`"
