# Guía de usuario con capturas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guía de uso del Panel (tareas paso a paso + referencia por pantallas) con capturas reales, visible en la página `/guia` y descargable en PDF, regenerable con `npm run guia`.

**Architecture:** El contenido vive en `docs/guia-usuario.md`. `src/lib/guia.ts` (puro) lo lee y extrae el índice; `GuiaUsuario` lo pinta con `react-markdown` en `/guia`. Un script con Playwright (`scripts/guia/`) levanta el stack de producción en Docker con datos de demostración, hace las capturas a `public/guia/` e imprime `/guia` a PDF.

**Tech Stack:** Next.js 16, React, `react-markdown`, Vitest 4 + Testing Library, Playwright (Chromium), Docker Compose, Prisma 7, `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-14-guia-usuario-design.md`

## Global Constraints

- Rama `feature/guia-usuario` (desde `develop`); un commit por tarea, Conventional Commits en español; nunca `git add .` ni `git add docs`/`git add prisma` (en el árbol hay cambios del usuario: `.env.example` y `prisma/.env.example` borrados, `.atl/` y `AGENTS.md`). Antes de cada commit `git restore .env.example prisma/.env.example`, y después `rm` de ambos.
- Dependencias nuevas con **versión exacta** (`npm view <paquete> version` y `npm install <paquete>@<versión>`); en Windows no reinstalar ni actualizar vitest (falla con «edgesOut»).
- `src/lib/guia.ts` al 100 % (se añade a `thresholds` de `vitest.config.ts`); componentes ≥ 80 %. Prohibido `any`.
- `react-markdown` **sin** `rehype-raw` ni ningún plugin que habilite HTML crudo.
- Capturas: tema claro, ventana 1440×900, solo datos ficticios (clientes `acme`, `tienda-mari`, `estudio-norte`; dominios `*.example.com`). Nunca credenciales ni datos reales.
- Imágenes en el Markdown con ruta relativa `../public/guia/<nombre>.png`; la página las sirve como `/guia/<nombre>.png`.
- El script nunca toca carpetas del equipo (`/var/vicalba` incluido): solo volúmenes con nombre del proyecto `vicalba-guia`.
- Textos en español con el vocabulario de `CONTEXT.md`; comentarios de código solo para el porqué, en inglés.

## Review Focus

1. **Guía ausente en la instalación** (imagen construida sin `docs/guia-usuario.md`): `/guia` muestra «La guía no está disponible en esta instalación», no un error → `leerGuia` devuelve `null` (test en la tarea 1) y se comprueba la imagen en la tarea 3.
2. **HTML incrustado en el Markdown** (`<script>`, `<img onerror>`): se muestra como texto o se descarta, nunca se ejecuta ni se inserta como elemento → test en la tarea 2.
3. **Títulos repetidos o con acentos**: cada enlace del índice lleva a su título (las anclas del índice y las de los títulos coinciden) → tests en las tareas 1 y 2.
4. **Script interrumpido o fallo a mitad**: no quedan contenedores, volúmenes ni red del proyecto `vicalba-guia`; `npm run guia -- --limpiar` lo arregla si se mató el proceso → verificación en la tarea 4.
5. **Puertos 80/443 ocupados o stack del Panel ya levantado en local**: el script se niega antes de tocar nada → verificación en la tarea 4.

---

## Mapa de ficheros

| Fichero                                                                                                                                                                                                                             | Tarea | Responsabilidad                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------- |
| `src/lib/guia.ts` (+test), `vitest.config.ts`                                                                                                                                                                                       | 1     | Leer la guía, índice, anclas, rutas de imagen     |
| `src/components/guia/GuiaUsuario.tsx` (+test), `package.json`                                                                                                                                                                       | 2     | Pintar el Markdown con índice y botón PDF         |
| `src/app/(panel)/guia/page.tsx`, `src/components/layout/Sidebar.tsx`, `CommandPalette.tsx`, `src/components/ui/icons.tsx` (+tests), `src/app/(panel)/layout.tsx`, `.dockerignore`, `Dockerfile`, `docs/guia-usuario.md` (esqueleto) | 3     | Página, navegación, impresión e imagen Docker     |
| `scripts/guia/compose.guia.yml`, `scripts/guia/entorno.ts`, `scripts/guia/datos-demo.ts`, `scripts/guia/generar.ts`, `.gitignore`, `package.json`                                                                                   | 4     | Stack de la guía, datos de demostración, limpieza |
| `scripts/guia/capturas.ts`, `scripts/guia/generar.ts`, `package.json`, `public/guia/*.png`                                                                                                                                          | 5     | Capturas y PDF con Playwright                     |
| `docs/guia-usuario.md`, `public/guia/*`                                                                                                                                                                                             | 6     | Contenido completo de la guía                     |
| `CLAUDE.md`, `CHANGELOG.md`, `docs/roadmap.md`                                                                                                                                                                                      | 7     | Documentación, verificación final, PR             |

---

### Task 1: Lectura e índice de la guía (`src/lib/guia.ts`)

**Files:**

- Create: `src/lib/guia.ts`, `src/lib/guia.test.ts`
- Modify: `vitest.config.ts` (umbrales)

**Interfaces:**

- Produces:

  ```ts
  export type EntradaIndice = { nivel: 1 | 2; texto: string; ancla: string };
  export async function leerGuia(): Promise<string | null>;
  export function anclaDe(texto: string): string;
  export function generadorDeAnclas(): (texto: string) => string; // mismo orden ⇒ mismas anclas
  export function indiceGuia(md: string): EntradaIndice[];
  export function rutaImagen(src: string): string;
  ```

- [ ] **Step 1: Test (rojo)** — `src/lib/guia.test.ts`:

````ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockReadFile } = vi.hoisted(() => ({ mockReadFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mockReadFile }));

import {
  anclaDe,
  generadorDeAnclas,
  indiceGuia,
  leerGuia,
  rutaImagen,
} from "./guia";

beforeEach(() => vi.clearAllMocks());

describe("leerGuia", () => {
  it("lee docs/guia-usuario.md", async () => {
    mockReadFile.mockResolvedValue("# Guía");
    expect(await leerGuia()).toBe("# Guía");
    expect(mockReadFile.mock.calls[0]![0]).toMatch(
      /docs[\\/]guia-usuario\.md$/,
    );
  });

  it("devuelve null si el fichero no está (imagen sin la guía)", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    expect(await leerGuia()).toBeNull();
  });
});

describe("anclaDe", () => {
  it("minúsculas, sin acentos y con guiones", () => {
    expect(anclaDe("Configuración y backups")).toBe("configuracion-y-backups");
    expect(anclaDe("  2. Dar de alta un Cliente  ")).toBe(
      "2-dar-de-alta-un-cliente",
    );
    expect(anclaDe("¿Qué es ⌘K?")).toBe("que-es-k");
  });
});

describe("generadorDeAnclas", () => {
  it("añade -2, -3 a los títulos repetidos", () => {
    const ancla = generadorDeAnclas();
    expect(ancla("Si algo falla")).toBe("si-algo-falla");
    expect(ancla("Si algo falla")).toBe("si-algo-falla-2");
    expect(ancla("Si algo falla")).toBe("si-algo-falla-3");
  });
});

describe("indiceGuia", () => {
  it("recoge los # y ## con anclas únicas e ignora ### y los bloques de código", () => {
    const md = [
      "# Parte I — Tareas",
      "## Entrar y orientarse",
      "### Si algo falla",
      "```bash",
      "## no es un título",
      "```",
      "## Desplegar",
      "## Entrar y orientarse",
      "# Anexos\r",
    ].join("\n");
    expect(indiceGuia(md)).toEqual([
      { nivel: 1, texto: "Parte I — Tareas", ancla: "parte-i-tareas" },
      { nivel: 2, texto: "Entrar y orientarse", ancla: "entrar-y-orientarse" },
      { nivel: 2, texto: "Desplegar", ancla: "desplegar" },
      {
        nivel: 2,
        texto: "Entrar y orientarse",
        ancla: "entrar-y-orientarse-2",
      },
      { nivel: 1, texto: "Anexos", ancla: "anexos" },
    ]);
  });
});

describe("rutaImagen", () => {
  it("convierte la ruta relativa del repo en la URL que sirve el Panel", () => {
    expect(rutaImagen("../public/guia/dashboard.png")).toBe(
      "/guia/dashboard.png",
    );
    expect(rutaImagen("../../public/guia/a.png")).toBe("/guia/a.png");
  });

  it("deja igual cualquier otra ruta", () => {
    expect(rutaImagen("/guia/a.png")).toBe("/guia/a.png");
    expect(rutaImagen("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
  });
});
````

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/guia.test.ts` → FAIL «Cannot find module './guia'».

- [ ] **Step 3: Implementar `src/lib/guia.ts`**

````ts
import { readFile } from "node:fs/promises";
import path from "node:path";

export type EntradaIndice = { nivel: 1 | 2; texto: string; ancla: string };

export async function leerGuia(): Promise<string | null> {
  try {
    return await readFile(
      path.join(process.cwd(), "docs", "guia-usuario.md"),
      "utf-8",
    );
  } catch {
    return null;
  }
}

export function anclaDe(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The index and the rendered headings must produce the same anchors in the
// same order, so both go through one of these.
export function generadorDeAnclas(): (texto: string) => string {
  const vistas = new Map<string, number>();
  return (texto) => {
    const base = anclaDe(texto);
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
}

export function indiceGuia(md: string): EntradaIndice[] {
  const ancla = generadorDeAnclas();
  const indice: EntradaIndice[] = [];
  let enCodigo = false;
  for (const linea of md.split("\n")) {
    if (linea.startsWith("```")) {
      enCodigo = !enCodigo;
      continue;
    }
    const m = enCodigo ? null : /^(#{1,2}) (.+?)\s*$/.exec(linea);
    if (!m) continue;
    const texto = m[2]!;
    indice.push({
      nivel: m[1]!.length === 1 ? 1 : 2,
      texto,
      ancla: ancla(texto),
    });
  }
  return indice;
}

export function rutaImagen(src: string): string {
  return src.replace(/^(\.\.\/)+public\//, "/");
}
````

- [ ] **Step 4: Verde y 100 %** — `npx vitest run src/lib/guia.test.ts --coverage --coverage.include=src/lib/guia.ts --coverage.reporter=text` → todos verdes, 100 % en las cuatro columnas.

- [ ] **Step 5: Umbral** — en `vitest.config.ts`, dentro de `thresholds`, junto a `"src/lib/formatHace.ts"`:

```ts
        "src/lib/guia.ts": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/guia.ts src/lib/guia.test.ts vitest.config.ts
git commit -m "feat(guia): lectura de la guía, índice y anclas"
```

---

### Task 2: Componente `GuiaUsuario`

**Files:**

- Create: `src/components/guia/GuiaUsuario.tsx`, `src/components/guia/GuiaUsuario.test.tsx`
- Modify: `package.json`, `package-lock.json` (`react-markdown`)

**Interfaces:**

- Consumes: `indiceGuia`, `generadorDeAnclas`, `rutaImagen` (t.1).
- Produces: `export function GuiaUsuario({ markdown }: { markdown: string }): JSX.Element` — sin estado ni `"use client"` (se pinta en el servidor).

- [ ] **Step 1: Dependencia** — `npm view react-markdown version` y `npm install react-markdown@<esa versión>`. Comprobar `git diff package.json`: solo una línea nueva en `dependencies`.

- [ ] **Step 2: Test (rojo)** — `src/components/guia/GuiaUsuario.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GuiaUsuario } from "./GuiaUsuario";

const md = [
  "# Parte I — Tareas",
  "Introducción con **negrita**.",
  "## Entrar y orientarse",
  "![El Dashboard](../public/guia/dashboard.png)",
  "### Si algo falla",
  "Revisa [la recuperación](https://example.com/recuperacion).",
  "## Entrar y orientarse",
].join("\n\n");

describe("GuiaUsuario", () => {
  it("pinta los títulos con las mismas anclas que el índice", () => {
    render(<GuiaUsuario markdown={md} />);
    const indice = screen.getByRole("navigation", {
      name: "Índice de la guía",
    });
    const enlaces = within(indice).getAllByRole("link");
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual([
      "#parte-i-tareas",
      "#entrar-y-orientarse",
      "#entrar-y-orientarse-2",
    ]);
    for (const a of enlaces) {
      const id = a.getAttribute("href")!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("sirve las imágenes desde /guia y las abre a tamaño real", () => {
    render(<GuiaUsuario markdown={md} />);
    const img = screen.getByRole("img", { name: "El Dashboard" });
    expect(img).toHaveAttribute("src", "/guia/dashboard.png");
    expect(img.closest("a")).toHaveAttribute("href", "/guia/dashboard.png");
    expect(img.closest("a")).toHaveAttribute("target", "_blank");
  });

  it("ofrece el PDF", () => {
    render(<GuiaUsuario markdown={md} />);
    const pdf = screen.getByRole("link", { name: "Descargar PDF" });
    expect(pdf).toHaveAttribute("href", "/guia/guia-usuario.pdf");
    expect(pdf).toHaveAttribute("download");
  });

  it("los enlaces externos se abren aparte", () => {
    render(<GuiaUsuario markdown={md} />);
    const enlace = screen.getByRole("link", { name: "la recuperación" });
    expect(enlace).toHaveAttribute("target", "_blank");
    expect(enlace).toHaveAttribute("rel", "noreferrer");
  });

  it("no inserta HTML del Markdown como elementos", () => {
    const { container } = render(
      <GuiaUsuario
        markdown={
          '<script>window.x=1</script>\n\n<img src="x" onerror="alert(1)">\n\nTexto'
        }
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByText("Texto")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ver fallar** — `npx vitest run src/components/guia` → FAIL (módulo inexistente).

- [ ] **Step 4: Implementar `src/components/guia/GuiaUsuario.tsx`**

```tsx
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import { generadorDeAnclas, indiceGuia, rutaImagen } from "@/lib/guia";

function textoPlano(nodo: ReactNode): string {
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return nodo.map(textoPlano).join("");
  if (nodo && typeof nodo === "object" && "props" in nodo) {
    return textoPlano((nodo.props as { children?: ReactNode }).children);
  }
  return "";
}

export function GuiaUsuario({ markdown }: { markdown: string }) {
  const indice = indiceGuia(markdown);
  // A fresh generator per render keeps anchors aligned with indiceGuia().
  const ancla = generadorDeAnclas();

  const componentes: Components = {
    h1: ({ children }) => (
      <h1
        id={ancla(textoPlano(children))}
        className="scroll-mt-6 font-display text-2xl font-semibold pt-4 print:break-before-page"
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        id={ancla(textoPlano(children))}
        className="scroll-mt-6 font-display text-lg font-semibold pt-3 print:break-before-page"
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="font-display text-sm font-semibold">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="font-body text-[13.5px] leading-relaxed text-text-secondary">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="flex flex-col gap-1.5 pl-5 list-disc marker:text-text-muted font-body text-[13.5px] leading-relaxed text-text-secondary">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="flex flex-col gap-1.5 pl-5 list-decimal marker:text-text-muted font-body text-[13.5px] leading-relaxed text-text-secondary">
        {children}
      </ol>
    ),
    a: ({ href, children }) => {
      const externo = href?.startsWith("http") ?? false;
      return (
        <a
          href={href}
          {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}
          className="text-[var(--color-accent)] underline underline-offset-2"
        >
          {children}
        </a>
      );
    },
    code: ({ children }) => (
      <code className="px-1 rounded-[var(--radius-sm)] bg-elevated text-[0.92em]">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="overflow-x-auto rounded-[var(--radius-md)] bg-terminal text-terminal-text p-3 text-xs [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    ),
    img: ({ src, alt }) => {
      const url = rutaImagen(typeof src === "string" ? src : "");
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block print:break-inside-avoid"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Markdown images have no known size for next/image */}
          <img
            src={url}
            alt={alt ?? ""}
            loading="lazy"
            className="w-full rounded-[var(--radius-md)] border border-border"
          />
        </a>
      );
    },
  };

  return (
    <div className="flex flex-wrap items-start gap-8">
      <nav
        aria-label="Índice de la guía"
        className="flex-[1_1_200px] max-w-[240px] md:sticky md:top-6 print:hidden"
      >
        <details open className="md:[&>summary]:hidden">
          <summary className="cursor-pointer font-body text-xs text-text-muted">
            Índice
          </summary>
          <ol className="flex flex-col gap-1 font-body text-[12.5px]">
            {indice.map((e) => (
              <li
                key={e.ancla}
                className={e.nivel === 2 ? "pl-3" : "pt-2 font-semibold"}
              >
                <a
                  href={`#${e.ancla}`}
                  className="text-text-secondary hover:text-text-primary"
                >
                  {e.texto}
                </a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
      <article className="flex flex-[999_1_560px] min-w-0 max-w-3xl flex-col gap-4">
        <a
          href="/guia/guia-usuario.pdf"
          download
          className="self-start inline-flex items-center min-h-10 px-4 rounded-[var(--radius-md)] border border-border-strong font-body text-[12.5px] text-text-primary hover:bg-elevated print:hidden"
        >
          Descargar PDF
        </a>
        <Markdown components={componentes}>{markdown}</Markdown>
      </article>
    </div>
  );
}
```

- [ ] **Step 5: Verde y cobertura** — `npx vitest run src/components/guia --coverage --coverage.include='src/components/guia/**' --coverage.reporter=text` → verde, ≥ 80 % en todas las columnas. Si falta cobertura de una rama de `textoPlano`, añadir un caso con un título que lleve `**negrita**` o `` `código` `` y comprobar su ancla. `npx tsc --noEmit` y `npx eslint src/components/guia` limpios.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/guia/GuiaUsuario.tsx src/components/guia/GuiaUsuario.test.tsx
git commit -m "feat(guia): componente que pinta la guía con índice y botón PDF"
```

---

### Task 3: Página `/guia`, navegación, impresión e imagen Docker

**Files:**

- Create: `src/app/(panel)/guia/page.tsx`, `docs/guia-usuario.md` (esqueleto)
- Modify: `src/components/ui/icons.tsx` (+`icons.test.tsx`), `src/components/layout/Sidebar.tsx` (+test), `src/components/layout/CommandPalette.tsx` (+test), `src/app/(panel)/layout.tsx`, `.dockerignore`, `Dockerfile`

**Interfaces:**

- Consumes: `leerGuia` (t.1), `GuiaUsuario` (t.2).
- Produces: ruta `/guia`; icono `IconBook`.

- [ ] **Step 1: Tests (rojo).**
  - `src/components/ui/icons.test.tsx`: añadir `IconBook` al import y a la lista de iconos que el test recorre.
  - `src/components/layout/Sidebar.test.tsx`, junto a «renderiza el enlace Novedades»:

    ```tsx
    it("renderiza el enlace Guía", () => {
      render(<Sidebar proyectos={proyectos} usuario={usuario} />);
      expect(screen.getByRole("link", { name: "Guía" })).toHaveAttribute(
        "href",
        "/guia",
      );
    });
    ```

  - `src/components/layout/CommandPalette.test.tsx`, junto a «muestra también las páginas del panel»:

    ```tsx
    it("encuentra la guía buscando «ayuda»", async () => {
      render(<CommandPalette proyectos={proyectos} />);
      const input = await abrir();
      await userEvent.type(input, "ayuda");
      expect(screen.getByRole("option", { name: /guía/i })).toBeInTheDocument();
    });
    ```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/components/ui/icons.test.tsx src/components/layout` → los tres nuevos en rojo.

- [ ] **Step 3: Implementar.**
  - `src/components/ui/icons.tsx`, tras `IconClock`:

    ```tsx
    export const IconBook = (p: IconProps) => (
      <svg {...S(p)}>
        <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" />
        <path d="M4 21V5M8 7h7" />
      </svg>
    );
    ```

  - `Sidebar.tsx`: importar `IconBook` y añadir al final de `nav` `{ href: "/guia", label: "Guía", icon: IconBook, exact: false }`. Al `<aside>` raíz añadir la clase `print:hidden`.
  - `CommandPalette.tsx`: añadir a `PAGINAS` `{ id: "pag-guia", href: "/guia", etiqueta: "Guía", detalle: "página", buscable: "guía guia ayuda manual documentación" }`.
  - `src/app/(panel)/layout.tsx`: al `div` con `md:grid` añadir `print:block`, y al `<main>` `print:h-auto print:overflow-visible` (sin esto el PDF sale con la columna de la barra lateral y cortado a la altura de la ventana).
  - `src/app/(panel)/guia/page.tsx`:

    ```tsx
    import { redirect } from "next/navigation";
    import { auth } from "@/lib/auth";
    import { leerGuia } from "@/lib/guia";
    import { GuiaUsuario } from "@/components/guia/GuiaUsuario";
    import { PageHeader } from "@/components/layout/PageHeader";

    export const dynamic = "force-dynamic";

    export default async function GuiaPage() {
      const session = await auth();
      if (!session) redirect("/login");

      const markdown = await leerGuia();

      return (
        <div className="flex flex-col gap-6 px-5 md:px-10 pt-7 pb-14 print:p-0">
          <div className="print:hidden">
            <PageHeader comando="man vicalba" titulo="Guía" />
          </div>
          {markdown ? (
            <GuiaUsuario markdown={markdown} />
          ) : (
            <p className="font-body text-sm text-text-muted">
              La guía no está disponible en esta instalación.
            </p>
          )}
        </div>
      );
    }
    ```

  - `.dockerignore`: tras `!CHANGELOG.md` añadir:

    ```
    # The panel reads it at runtime for the Guía page.
    !docs/guia-usuario.md
    ```

  - `Dockerfile`, tras el `COPY` de `CHANGELOG.md`:

    ```dockerfile
    COPY --from=builder --chown=nextjs:nodejs /app/docs/guia-usuario.md ./docs/guia-usuario.md
    ```

  - `docs/guia-usuario.md` (esqueleto; la tarea 6 lo completa): título `# Guía de uso del Panel`, un párrafo de presentación y los títulos de la estructura de la spec (`# Parte I — Tareas paso a paso` con sus nueve `##`, `# Parte II — Referencia por pantallas` con sus `##`, `# Anexos`), cada uno con una frase de qué cubrirá.

- [ ] **Step 4: Verde** — `npx vitest run src/components src/lib/guia.test.ts`, `npx tsc --noEmit`, `npm run lint`.

- [ ] **Step 5: La imagen incluye la guía** —

```bash
docker build -t vicalba-panel:guia .
docker run --rm --entrypoint sh vicalba-panel:guia -c "ls -l docs/guia-usuario.md && head -3 docs/guia-usuario.md"
```

Expected: el fichero existe con el esqueleto. (Si `.dockerignore` no lo reincluye por el `docs` del principio, mover la excepción tras `*.md` y repetir.)

- [ ] **Step 6: Commit**

```bash
git add "src/app/(panel)/guia/page.tsx" "src/app/(panel)/layout.tsx" src/components/ui/icons.tsx src/components/ui/icons.test.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/CommandPalette.tsx src/components/layout/CommandPalette.test.tsx .dockerignore Dockerfile docs/guia-usuario.md
git commit -m "feat(guia): página Guía en el Panel con su entrada en la navegación"
```

---

### Task 4: Stack de la guía y datos de demostración

**Files:**

- Create: `scripts/guia/compose.guia.yml`, `scripts/guia/entorno.ts`, `scripts/guia/datos-demo.ts`, `scripts/guia/generar.ts`
- Modify: `.gitignore` (`scripts/guia/.tmp/`), `package.json` (script `guia`)

**Interfaces:**

- Produces (`entorno.ts`):

  ```ts
  export const PROYECTO = "vicalba-guia";
  export const RED_DEMO = "vicalba-guia-demo";
  export const TMP: string; // scripts/guia/.tmp
  export type EntornoGuia = Record<string, string>; // claves del .env generado
  export function docker(
    args: string[],
    opciones?: { permitirFallo?: boolean },
  ): string;
  export function comprobarRequisitos(): void; // lanza Error con el motivo
  export function generarEnv(): EntornoGuia; // escribe TMP/.env
  export function compose(args: string[]): void;
  export function esperarPanelSano(timeoutMs?: number): Promise<void>;
  export function prepararVolumenes(): void;
  export function generarClaveSsh(): { publica: string; privada: string };
  export function arrancarSftp(clavePublica: string): void;
  export function arrancarContenedoresDemo(): void;
  export function limpiar(): void; // idempotente, nunca lanza
  ```

- Produces (`datos-demo.ts`): `export async function sembrar(entorno: EntornoGuia, claveSftp: { publica: string; privada: string }): Promise<void>` y las constantes `USUARIO_DEMO = { email: "guia@vicalba.local", password: "guia-demo-2026", nombre: "Laura Martín" }`.

- [ ] **Step 1: `scripts/guia/compose.guia.yml`**

```yaml
# Overrides for `npm run guia`: never touch host folders, expose the DB to seed it.
networks:
  vicalba-guia-demo:
    name: vicalba-guia-demo

volumes:
  guia-repos:
  guia-dynamic:

services:
  traefik:
    volumes:
      - guia-dynamic:/etc/traefik/dynamic
  db:
    ports:
      - "127.0.0.1:5434:5432"
  panel:
    networks:
      - vicalba-net
      - vicalba-guia-demo
    volumes:
      - guia-dynamic:/etc/traefik/dynamic
      - guia-repos:/var/vicalba/repos
      # Docker Desktop cannot mount / with rslave.
      - /tmp:/hostroot:ro
```

- [ ] **Step 2: `scripts/guia/entorno.ts`**

```ts
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROYECTO = "vicalba-guia";
export const RED_DEMO = "vicalba-guia-demo";
export const TMP = path.join(process.cwd(), "scripts", "guia", ".tmp");
const ENV = path.join(TMP, ".env");
const CONTENEDORES_FIJOS = ["traefik", "vicalba-db", "vicalba-panel"];
const SFTP = "vicalba-guia-sftp";

export type EntornoGuia = Record<string, string>;

export function docker(
  args: string[],
  opciones: { permitirFallo?: boolean } = {},
): string {
  try {
    return execFileSync("docker", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      // Git Bash on Windows rewrites /paths in arguments otherwise.
      env: { ...process.env, MSYS_NO_PATHCONV: "1" },
    }).trim();
  } catch (err) {
    if (opciones.permitirFallo) return "";
    throw err;
  }
}

export function compose(args: string[]): void {
  execFileSync(
    "docker",
    [
      "compose",
      "-p",
      PROYECTO,
      "--env-file",
      ENV,
      "-f",
      "docker-compose.yml",
      "-f",
      path.join("scripts", "guia", "compose.guia.yml"),
      ...args,
    ],
    { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
}

export function comprobarRequisitos(): void {
  docker(["info", "--format", "{{.ServerVersion}}"]);
  const existentes = docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n");
  const ocupados = CONTENEDORES_FIJOS.filter((n) => existentes.includes(n));
  if (ocupados.length > 0) {
    throw new Error(
      `Ya existen contenedores ${ocupados.join(", ")}: para el stack del Panel antes ` +
        "(o ejecuta `npm run guia -- --limpiar` si son de una ejecución anterior).",
    );
  }
  const puertos = docker(["ps", "--format", "{{.Ports}}"]);
  if (/:(80|443)->/.test(puertos)) {
    throw new Error("Los puertos 80 o 443 están ocupados por otro contenedor.");
  }
  execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" }).toString();
}

export function generarEnv(): EntornoGuia {
  mkdirSync(TMP, { recursive: true });
  const dbPassword = randomBytes(16).toString("hex");
  const gid = docker([
    "run",
    "--rm",
    "-v",
    "/var/run/docker.sock:/s",
    "alpine",
    "stat",
    "-c",
    "%g",
    "/s",
  ]);
  const entorno: EntornoGuia = {
    DB_PASSWORD: dbPassword,
    DATABASE_URL: `postgresql://vicalba:${dbPassword}@db:5432/vicalba`,
    NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
    NEXTAUTH_URL: "https://localhost",
    PANEL_DOMAIN: "localhost",
    ACME_EMAIL: "guia@example.com",
    GITHUB_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    DOCKER_GID: gid,
    SENTRY_DSN: "",
  };
  writeFileSync(
    ENV,
    Object.entries(entorno)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
  );
  return entorno;
}

export async function esperarPanelSano(timeoutMs = 300_000): Promise<void> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const estado = docker(
      ["inspect", "-f", "{{.State.Health.Status}}", "vicalba-panel"],
      { permitirFallo: true },
    );
    if (estado === "healthy") return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    "El Panel no llegó a estar sano en 5 minutos (docker logs vicalba-panel).",
  );
}

// Named volumes are created root-owned; the panel runs as uid 1001.
export function prepararVolumenes(): void {
  docker([
    "exec",
    "-u",
    "0",
    "vicalba-panel",
    "chown",
    "-R",
    "1001:1001",
    "/var/vicalba/repos",
    "/etc/traefik/dynamic",
  ]);
}

export function generarClaveSsh(): { publica: string; privada: string } {
  const fichero = path.join(TMP, "sftp_ed25519");
  rmSync(fichero, { force: true });
  rmSync(`${fichero}.pub`, { force: true });
  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-C",
    "vicalba-guia",
    "-f",
    fichero,
  ]);
  return {
    publica: readFileSync(`${fichero}.pub`, "utf-8").trim(),
    privada: readFileSync(fichero, "utf-8"),
  };
}

export function arrancarSftp(clavePublica: string): void {
  docker([
    "run",
    "-d",
    "--name",
    SFTP,
    "--network",
    RED_DEMO,
    "--label",
    "vicalba.guia=1",
    "-e",
    `PUBLIC_KEY=${clavePublica}`,
    "-e",
    "USER_NAME=copias",
    "lscr.io/linuxserver/openssh-server:latest",
  ]);
  // The image creates the user on first start; wait for it before preparing the folder.
  for (let i = 0; i < 30; i++) {
    if (docker(["exec", SFTP, "id", "copias"], { permitirFallo: true })) break;
    execFileSync(process.execPath, ["-e", "setTimeout(()=>{},1000)"]);
  }
  docker([
    "exec",
    SFTP,
    "sh",
    "-c",
    "mkdir -p /config/copias && chown copias /config/copias",
  ]);
}

const LOG_DEMO = [
  "i=0; while true; do i=$((i+1));",
  'echo "{\\"level\\":30,\\"time\\":$(date +%s)000,\\"msg\\":\\"GET /productos 200 en 12 ms\\"}";',
  '[ $((i % 4)) -eq 0 ] && echo "{\\"level\\":40,\\"time\\":$(date +%s)000,\\"msg\\":\\"Caché de catálogo caducada, recargando\\"}";',
  '[ $((i % 9)) -eq 0 ] && echo "{\\"level\\":50,\\"time\\":$(date +%s)000,\\"msg\\":\\"Pasarela de pago: timeout tras 5000 ms\\"}";',
  "sleep 1; done",
].join(" ");

export function arrancarContenedoresDemo(): void {
  docker([
    "run",
    "-d",
    "--name",
    "vicalba-guia-tienda",
    "--label",
    "vicalba.guia=1",
    "--label",
    "com.docker.compose.project=tienda-mari-tienda",
    "--label",
    "com.docker.compose.service=app",
    "alpine",
    "sh",
    "-c",
    LOG_DEMO,
  ]);
}

export function limpiar(): void {
  try {
    if (readFileSync(ENV, "utf-8")) compose(["down", "-v", "--remove-orphans"]);
  } catch {
    // No .env: nothing was started by compose.
  }
  const demo = docker(["ps", "-aq", "--filter", "label=vicalba.guia=1"], {
    permitirFallo: true,
  });
  if (demo) docker(["rm", "-f", ...demo.split("\n")], { permitirFallo: true });
  docker(["network", "rm", RED_DEMO], { permitirFallo: true });
  rmSync(TMP, { recursive: true, force: true });
}
```

NOTE para el implementador: los argumentos de `docker` van en arrays (sin shell), como en `src/lib/backups/procesos.ts`. Si `docker compose down -v` falla porque el `.env` ya no existe, `limpiar` sigue con el resto. `esperarPanelSano` usa el healthcheck del contenedor; Traefik puede tardar unos segundos más en enrutar, de eso se ocupa el primer `page.goto` de la tarea 5 con reintentos.

- [ ] **Step 3: `scripts/guia/datos-demo.ts`.** Siembra con Prisma (mismo patrón que `prisma/seed.ts`: `PrismaPg` + `PrismaClient`) conectando a `postgresql://vicalba:<DB_PASSWORD>@localhost:5434/vicalba`. Antes de importar `@/lib/crypto` fija en `process.env` las variables que valida `src/env.ts` con los valores del `.env` generado (`DATABASE_URL` con `localhost:5434`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GITHUB_WEBHOOK_SECRET`, `ENCRYPTION_KEY`) y luego `const { cifrar } = await import("@/lib/crypto")`, para cifrar con la misma clave que usa el Panel. Datos exactos:
  - Usuarios (`bcryptjs`, coste 12): `USUARIO_DEMO` y `{ email: "carlos@vicalba.local", nombre: "Carlos Ruiz" }` con contraseña aleatoria.
  - Credenciales SSH: «Servidor de copias» (la clave de `generarClaveSsh`, cifrada) y «GitHub — despliegues» (otra clave generada con `generarClaveSsh` antes de la del SFTP o una segunda llamada con otro fichero).
  - Clientes: `acme` «ACME Logística», `tienda-mari` «Tienda Mari», `estudio-norte` «Estudio Norte».
  - Proyectos (todos con `ultimoDeployEn` reciente salvo donde se indica):

    | Cliente / nombre           | tipo       | estado    | dominio                              | otros                                                                                                                        |
    | -------------------------- | ---------- | --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
    | acme / `web`               | compose    | running   | `web.acme.example.com`               | `repositorioUrl: git@github.com:acme/web.git`, `rama: main`, `autoDeployHabilitado: true`, credencial «GitHub — despliegues» |
    | acme / `api`               | dockerfile | error     | `api.acme.example.com`               | repo `git@github.com:acme/api.git`, `puerto: 3000`, `dockerfilePath: Dockerfile`                                             |
    | tienda-mari / `tienda`     | nodejs     | running   | `tienda-mari.example.com`            | repo `https://github.com/tienda-mari/tienda.git`, `puerto: 3000`, `buildCommand: npm run build`, `startCommand: npm start`   |
    | tienda-mari / `blog`       | image      | stopped   | `blog.tienda-mari.example.com`       | `imagenUrl: ghost:5-alpine`, `puerto: 2368`                                                                                  |
    | estudio-norte / `intranet` | compose    | running   | `intranet.estudio-norte.example.com` | `composeContent` con servicios `app` (`nginx:alpine`) y `db` (`postgres:16-alpine`), sin repositorio                         |
    | estudio-norte / `landing`  | compose    | deploying | `estudio-norte.example.com`          | repo `git@github.com:estudio-norte/landing.git`                                                                              |

  - Deploys (con `output` que use los marcadores reales de `DeployLogsPanel`: `→ Clonando repositorio`, `→ Haciendo checkout`, `→ SHA: <sha>`, `→ Construyendo e iniciando`, `→ Conectando red y proxy`, `✓ Deploy completado`, intercalados con líneas de build verosímiles):
    - `acme/web`: tres `exito` (orígenes `manual`, `webhook`, `webhook`; shas `3f9c2a1…`, `8b41d07…`, `c72e5f0…`; hace 3 días, 1 día, 2 horas).
    - `acme/api`: uno `exito` hace 2 días (sha `5d1e9b4…`, el commit para el rollback) y el último `error` hace 40 min (sha `a90f3c2…`) cuya salida termina en un error de build (`npm ERR! Missing script: "build"` y `✗ docker compose up falló`).
    - `tienda-mari/tienda`: uno `exito` hace 5 h.
    - `tienda-mari/blog`: uno `cancelado` hace 1 día.
    - `estudio-norte/landing`: uno `en_curso` iniciado hace 1 min con salida hasta `→ Construyendo e iniciando`.
  - Variables de `acme/web` (cifradas): `NODE_ENV=production`, `DATABASE_URL=postgresql://web:demo@db:5432/web`, `SMTP_PASSWORD=demo-no-real`, `NEXT_PUBLIC_SITE_URL=https://web.acme.example.com` (`enBuildTime: true`).
  - Volumen de `acme/web`: `uploads` → `/app/uploads`, y crear contenido en el contenedor del Panel:
    `docker exec -u 1001 vicalba-panel sh -c 'd=/var/vicalba/repos/acme/web/volumes/uploads; mkdir -p "$d/productos" && printf demo > "$d/logo.png" && printf demo > "$d/productos/camiseta.jpg" && printf "a,b\n1,2\n" > "$d/catalogo.csv"'` (ruta de `rutaHostVolumen` en `src/lib/volumenes.ts`).
  - `ConfiguracionDeploy`: `timeoutMinutos: 30`.
  - `ConfiguracionNotificacion`: webhook habilitado `https://hooks.slack.com/services/T000/B000/demo` con `webhookUltimoEnvioEn` hace 2 h y sin error; Telegram habilitado (`telegramChatId: "-100123456"`, token `cifrar("000000:demo")`) con último envío hace 2 h; email deshabilitado.
  - Historial de backups (filas `Backup` antiguas, sin snapshot real): copia `programado` `exito` hace 2 días (`bytesAnadidos` 1 843 200), copia `programado` `error` hace 1 día con `error: "El destino no responde (30 s): Stat: dial tcp: i/o timeout"`, restauración `manual` `exito` hace 20 h. La configuración del destino **no** se siembra: la crea la tarea 5 desde la UI.

- [ ] **Step 4: `scripts/guia/generar.ts` (parte de esta tarea)**

```ts
import {
  arrancarContenedoresDemo,
  arrancarSftp,
  comprobarRequisitos,
  compose,
  esperarPanelSano,
  generarClaveSsh,
  generarEnv,
  limpiar,
  prepararVolumenes,
} from "./entorno";
import { sembrar } from "./datos-demo";

async function main(): Promise<void> {
  if (process.argv.includes("--limpiar")) {
    limpiar();
    console.log("Entorno de la guía eliminado.");
    return;
  }
  comprobarRequisitos();
  try {
    const entorno = generarEnv();
    compose(["up", "-d", "--build"]);
    await esperarPanelSano();
    prepararVolumenes();
    const claveSftp = generarClaveSsh();
    arrancarSftp(claveSftp.publica);
    await sembrar(entorno, claveSftp);
    arrancarContenedoresDemo();
    if (process.argv.includes("--pausa")) {
      console.log(
        "Stack de la guía en https://localhost. Pulsa Enter para limpiar.",
      );
      await new Promise((r) => process.stdin.once("data", r));
    }
  } finally {
    limpiar();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```

`package.json` → `"guia": "tsx scripts/guia/generar.ts"`. `.gitignore` → `scripts/guia/.tmp/`.

- [ ] **Step 5: Verificación real.**
  1. `npm run guia -- --pausa`: al pausar, entrar en `https://localhost` con `guia@vicalba.local` / `guia-demo-2026` y comprobar Dashboard (acme/api en error, landing desplegando), Proyectos con los 6 proyectos, el log por fases de `acme/web`, las variables descifradas, el explorador del volumen `uploads` y los logs en vivo de `tienda-mari/tienda` con los tres niveles. Pulsar Enter.
  2. Tras la limpieza: `docker ps -a --filter label=vicalba.guia=1`, `docker volume ls | grep vicalba-guia` y `docker network ls | grep vicalba-guia` vacíos, y `scripts/guia/.tmp` no existe.
  3. Review Focus 5: con un contenedor escuchando en el 80 (`docker run -d --name ocupa80 -p 80:80 nginx:alpine`), `npm run guia` termina con «Los puertos 80 o 443 están ocupados…» sin crear nada; `docker rm -f ocupa80`.
  4. Review Focus 4: lanzar `npm run guia -- --pausa`, matar el proceso (cerrar la terminal) a mitad del arranque; `npm run guia` se niega («Ya existen contenedores…»); `npm run guia -- --limpiar` deja el equipo limpio.

- [ ] **Step 6: Commit**

```bash
git add scripts/guia/compose.guia.yml scripts/guia/entorno.ts scripts/guia/datos-demo.ts scripts/guia/generar.ts .gitignore package.json
git commit -m "feat(guia): stack de demostración para generar la guía"
```

---

### Task 5: Capturas y PDF con Playwright

**Files:**

- Create: `scripts/guia/capturas.ts`, `public/guia/*.png`, `public/guia/guia-usuario.pdf`
- Modify: `scripts/guia/generar.ts`, `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: `USUARIO_DEMO` (t.4), `docker` (t.4), la página `/guia` (t.3).
- Produces: las imágenes de la tabla de abajo (nombres estables que usa la tarea 6) y `public/guia/guia-usuario.pdf`; `export async function capturar(page: Page): Promise<void>` y `export async function imprimirPdf(page: Page): Promise<void>` en `capturas.ts`.

- [ ] **Step 1: Dependencia** — `npm view @playwright/test version`, `npm install -D @playwright/test@<versión>` y `npx playwright install chromium`.

- [ ] **Step 2: `scripts/guia/capturas.ts`.** Estructura:

```ts
import type { Locator, Page } from "@playwright/test";
import path from "node:path";
import { USUARIO_DEMO } from "./datos-demo";

const BASE = "https://localhost";
const DESTINO = path.join(process.cwd(), "public", "guia");

type Paso = {
  nombre: string;
  ruta: string;
  preparar?: (page: Page) => Promise<void>;
  // Element to capture; whole page when absent.
  elemento?: (page: Page) => Locator;
};

async function abrir(page: Page, ruta: string): Promise<void> {
  // Traefik may still be picking up the panel right after it turns healthy.
  for (let intento = 0; ; intento++) {
    const res = await page.goto(BASE + ruta, { waitUntil: "networkidle" });
    if (res && res.status() < 400) return;
    if (intento >= 10) throw new Error(`${ruta} respondió ${res?.status()}`);
    await page.waitForTimeout(2000);
  }
}

export async function entrar(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem("vicalba-theme", "light"),
  );
  await abrir(page, "/login");
  await page.getByLabel("Email").fill(USUARIO_DEMO.email);
  await page.getByLabel("Contraseña").fill(USUARIO_DEMO.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(BASE + "/");
}

const PASOS: Paso[] = [
  /* tabla de abajo */
];

export async function capturar(page: Page): Promise<void> {
  for (const paso of PASOS) {
    await abrir(page, paso.ruta);
    await paso.preparar?.(page);
    const fichero = path.join(DESTINO, `${paso.nombre}.png`);
    if (paso.elemento) await paso.elemento(page).screenshot({ path: fichero });
    else await page.screenshot({ path: fichero, fullPage: true });
    console.log(`  ✓ ${paso.nombre}`);
  }
}

export async function imprimirPdf(page: Page): Promise<void> {
  await abrir(page, "/guia");
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.join(DESTINO, "guia-usuario.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="font-size:8px;width:100%;text-align:center;color:#666">Guía de uso — vicalba-app · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });
}
```

`entrar` captura antes la pantalla de login (`login.png`, página entera, sin sesión). Pasos (`ruta` → `preparar` → `elemento`); los nombres accesibles se confirman leyendo el componente indicado antes de escribir cada paso:

| nombre                      | ruta                                      | preparar / elemento                                                                                                                                                                           |
| --------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard`                 | `/`                                       | — (página entera)                                                                                                                                                                             |
| `busqueda`                  | `/`                                       | `Ctrl+K`, escribir `tienda` (`CommandPalette`) → elemento: el diálogo                                                                                                                         |
| `proyectos`                 | `/proyectos`                              | —                                                                                                                                                                                             |
| `cliente-nuevo`             | `/proyectos`                              | botón «Nuevo cliente» (`ClienteForm`) → el diálogo                                                                                                                                            |
| `proyecto-nuevo`            | `/proyectos`                              | «+ Proyecto» de ACME (`ClientSection`), rellenar nombre `docs` y repo `git@github.com:acme/docs.git` → el diálogo                                                                             |
| `proyecto-tipo-nodejs`      | `/proyectos`                              | como el anterior, eligiendo el tipo Node.js (`ProyectoForm`) → el diálogo                                                                                                                     |
| `proyecto-resumen`          | `/proyectos/<id acme/web>`                | —                                                                                                                                                                                             |
| `proyecto-deploys`          | `…?tab=deploys` de acme/web               | desplegar el último deploy si el log no se ve (`DeployLogsPanel`)                                                                                                                             |
| `proyecto-deploy-error`     | `…?tab=deploys` de acme/api               | — (muestra el error y el botón de rollback)                                                                                                                                                   |
| `proyecto-variables`        | `…?tab=variables` de acme/web             | —                                                                                                                                                                                             |
| `proyecto-variables-editor` | `…?tab=variables` de acme/web             | «Editar variables» → esperar al editor (`VariablesPanel`)                                                                                                                                     |
| `proyecto-logs`             | `…?tab=logs` de tienda-mari/tienda        | esperar 6 s a que lleguen líneas de los tres niveles (`VisorLogs`)                                                                                                                            |
| `proyecto-volumenes`        | `…?tab=volumenes` de acme/web             | —                                                                                                                                                                                             |
| `explorador-volumen`        | `…?tab=volumenes` de acme/web             | «Explorar ficheros de uploads» → el diálogo (`ExploradorVolumenModal`)                                                                                                                        |
| `proyecto-compose`          | `…?tab=compose` de estudio-norte/intranet | esperar a Monaco                                                                                                                                                                              |
| `proyecto-zona-peligrosa`   | `/proyectos/<id acme/web>`                | elemento: la sección «Zona peligrosa»                                                                                                                                                         |
| `config-notificaciones`     | `/configuracion?seccion=notificaciones`   | —                                                                                                                                                                                             |
| `config-deploys`            | `/configuracion?seccion=deploys`          | —                                                                                                                                                                                             |
| `config-credenciales`       | `/configuracion?seccion=credenciales`     | —                                                                                                                                                                                             |
| `config-webhook`            | `/configuracion?seccion=webhook`          | —                                                                                                                                                                                             |
| `config-sistema`            | `/configuracion?seccion=sistema`          | —                                                                                                                                                                                             |
| `backups-destino`           | `/configuracion?seccion=backups`          | elegir SFTP y rellenar host `vicalba-guia-sftp`, puerto `2222`, usuario `copias`, ruta `/config/copias`, credencial «Servidor de copias» (`DestinoBackupForm`) → captura **antes** de guardar |
| `backups-kit`               | (misma página)                            | «Probar y guardar», esperar al diálogo del kit (`KitRecuperacionModal`) → el diálogo; después marcar «He guardado el kit fuera de la VPS» y «Continuar»                                       |
| `backups-estado`            | `/configuracion?seccion=backups`          | activar «Copia diaria»; «Hacer copia ahora» y esperar a que el historial muestre una copia «Correcta» nueva (la sección se refresca sola)                                                     |
| `backups-copias`            | (misma página)                            | elemento: la tarjeta «Copias disponibles»                                                                                                                                                     |
| `backups-restaurar`         | (misma página)                            | «Restaurar» en la primera copia, escribir `RESTAURAR` sin confirmar → el diálogo; después «Cancelar»                                                                                          |
| `usuarios`                  | `/usuarios`                               | —                                                                                                                                                                                             |
| `novedades`                 | `/novedades`                              | —                                                                                                                                                                                             |

Los `<id>` de proyecto se obtienen en el propio paso: desde `/proyectos`, `page.getByRole("link", { name: "web" })` dentro de la sección de ACME y leer su `href`.

- [ ] **Step 3: `generar.ts`** — tras `arrancarContenedoresDemo()` (y fuera del modo `--pausa`):

```ts
const { chromium } = await import("@playwright/test");
const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const page = await contexto.newPage();
  await entrar(page);
  await capturar(page);
  // The image was built before the captures: serve the fresh guide and PNGs.
  docker([
    "cp",
    "docs/guia-usuario.md",
    "vicalba-panel:/app/docs/guia-usuario.md",
  ]);
  docker(["cp", "public/guia/.", "vicalba-panel:/app/public/guia/"]);
  docker(["restart", "vicalba-panel"]);
  await esperarPanelSano();
  await entrar(page);
  await imprimirPdf(page);
} finally {
  await navegador.close();
}
```

- [ ] **Step 4: Ejecutar** — `npm run guia`. Expected: un `✓` por paso, `public/guia/` con las 28 PNG (las 27 de la tabla + `login.png`) y `guia-usuario.pdf`, y la limpieza final. Abrir varias PNG y el PDF (con el esqueleto de la guía de la tarea 3) y comprobar: tema claro, datos ficticios, ningún diálogo cortado, el PDF sin barra lateral ni índice.

- [ ] **Step 5: Commit**

```bash
git add scripts/guia/capturas.ts scripts/guia/generar.ts package.json package-lock.json public/guia
git commit -m "feat(guia): capturas y PDF generados con Playwright"
```

---

### Task 6: Contenido de la guía

**Files:**

- Modify: `docs/guia-usuario.md`, `public/guia/*` (regenerados)

**Interfaces:**

- Consumes: los nombres de imagen de la tabla de la tarea 5; la estructura de la spec.

- [ ] **Step 1: Escribir `docs/guia-usuario.md`.** Reglas: títulos `#` (partes) y `##` (tareas y pantallas) en texto plano, sin negritas ni código dentro (el índice los toma literales); vocabulario de `CONTEXT.md`; segunda persona («pulsa», «elige»); imágenes con `![texto alternativo descriptivo](../public/guia/<nombre>.png)`. Contenido mínimo por sección:
  - **Presentación** (antes de la Parte I): qué es el Panel, para quién es la guía, cómo está organizada, que hay PDF.
  - **Parte I — Tareas paso a paso**, cada `##` con objetivo, pasos numerados, captura(s) y `### Si algo falla`:
    1. Entrar y orientarse — `login`, `dashboard`, `busqueda`: login, «Requiere atención», estado del VPS, últimos deploys, barra lateral, ⌘K, fijar proyectos, tema claro/oscuro.
    2. Dar de alta un Cliente y su primer Proyecto — `cliente-nuevo`, `proyecto-nuevo`: slug del Cliente y su red `cliente-<slug>-network`, tipo compose desde repositorio, rama, dominio, credencial SSH para repos privados.
    3. Desplegar y seguir el deploy — `proyecto-deploys`: botón Deploy, fases del log, cancelar con confirmación, timeout.
    4. Activar el auto-deploy con el webhook de GitHub — `config-webhook`, `proyecto-resumen`: datos para GitHub (URL, content type, secret, evento push), interruptor de auto-deploy, el `ping` y _Recent Deliveries_.
    5. Añadir variables de entorno — `proyecto-variables`, `proyecto-variables-editor`: editor `.env`, valores ocultos, build-time, importar un `.env`, que se aplican en el siguiente deploy.
    6. Ver los logs de un contenedor — `proyecto-logs`: filtros ALL/ERR/WARN/INFO, selector de servicio, marcas de tiempo, limpiar.
    7. Hacer rollback — `proyecto-deploy-error`: qué hace (redeploy del commit anterior correcto), desde el historial o desde «Requiere atención».
    8. Activar los backups — `backups-destino`, `backups-kit`, `backups-estado`: S3 o SFTP, «Probar y guardar», kit + `ENCRYPTION_KEY` fuera de la VPS, programación, qué incluye una copia, retención 7+4, avisos.
    9. Restaurar una copia — `backups-copias`, `backups-restaurar`: qué vuelve atrás y qué no (contenedores en marcha), copia previa automática para deshacer, escribir `RESTAURAR`.
  - **Parte II — Referencia por pantallas** (`##` por pantalla, con su captura y una lista de cada elemento y qué hace): Dashboard (`dashboard`), Proyectos (`proyectos`), Detalle de un Proyecto (`proyecto-resumen`, pestañas y `proyecto-zona-peligrosa`), Formulario de Proyecto (`proyecto-nuevo`, `proyecto-tipo-nodejs`; los cuatro tipos y sus campos), Volúmenes y explorador de ficheros (`proyecto-volumenes`, `explorador-volumen`), Editor de compose (`proyecto-compose`), Configuración — Notificaciones (`config-notificaciones`), Deploys (`config-deploys`), Backups (`backups-estado`), Credenciales SSH (`config-credenciales`), Webhook de GitHub (`config-webhook`), Sistema (`config-sistema`), Usuarios (`usuarios`), Novedades (`novedades`).
  - **Anexos**: Glosario (Panel, VPS, Cliente, Proyecto, Servicio, Red de proyecto, Deploy, Auto-deploy, Dominio, Certificado, Backup, Kit de recuperación, Restauración — definiciones de `CONTEXT.md` en lenguaje de usuario); Estados y colores (`running`, `stopped`, `error`, `deploying`, resultados de deploy y de backup); Recuperar el Panel en otra VPS (resumen y enlace a `docs/recuperacion.md`).

- [ ] **Step 2: Comprobar referencias** — todas las imágenes citadas existen:

```bash
grep -o '\.\./public/guia/[a-z0-9-]*\.png' docs/guia-usuario.md | sort -u | while read f; do [ -f "docs/$f" ] || echo "FALTA $f"; done
```

Expected: ninguna línea «FALTA». Y `npx vitest run src/lib/guia.test.ts` sigue verde.

- [ ] **Step 3: Regenerar** — `npm run guia` (las capturas cambian poco; el PDF ya lleva el contenido completo). Revisar el PDF: índice no impreso, cada parte/tarea/pantalla en página nueva, imágenes no partidas, pie con número de página.

- [ ] **Step 4: Commit**

```bash
git add docs/guia-usuario.md public/guia
git commit -m "docs(guia): guía de uso completa con capturas y PDF"
```

---

### Task 7: Documentación, verificación final y PR

**Files:**

- Modify: `CLAUDE.md`, `CHANGELOG.md`, `docs/roadmap.md`

- [ ] **Step 1: Documentación.**
  - `CLAUDE.md`, «Scripts npm»: `npm run guia            # regenera capturas y PDF de la guía (Docker, puertos 80/443 libres)`; nueva nota «### Nota — guía de usuario» en «Despliegue en producción»: contenido en `docs/guia-usuario.md`, página `/guia`, capturas y PDF en `public/guia/` generados con `npm run guia` (stack de demostración en Docker, proyecto `vicalba-guia`, `--pausa` para inspeccionarlo, `--limpiar` si se interrumpió), regenerar cuando cambie la UI y revisar el diff de imágenes; en «Estado actual», línea de la guía en la 2.2.0.
  - `CHANGELOG.md`, en `[2.2.0]` → `### Novedades`: «**Guía de uso** en el Panel (menú «Guía») con tareas paso a paso, referencia de cada pantalla y capturas; también en PDF.»
  - `docs/roadmap.md`, en «### 2.2.0»: `- [x] **Guía de usuario** — página «Guía» y PDF con capturas regenerables (`npm run guia`).`

- [ ] **Step 2: Verificación final** — `npm run test:unit -- --coverage` (sin errores de umbral), `npm run type-check`, `npm run lint`, `npm run build`.

- [ ] **Step 3: Commit y PR**

```bash
git add CLAUDE.md CHANGELOG.md docs/roadmap.md
git commit -m "docs: guía de usuario en CLAUDE.md, CHANGELOG y roadmap"
git push -u origin feature/guia-usuario
```

PR `feature/guia-usuario` → `develop` con: qué incluye, cómo regenerar (`npm run guia`), la ejecución hecha (número de capturas, tamaño del PDF), y que los ficheros de `public/guia/` son generados.
