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
        className="scroll-mt-6 font-display text-lg font-semibold pt-3 print:break-before-page print:[h1+&]:break-before-avoid"
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
      <ol className="flex flex-col gap-1.5 pl-7 list-decimal marker:text-text-muted font-body text-[13.5px] leading-relaxed text-text-secondary">
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
            className="max-w-full h-auto rounded-[var(--radius-md)] border border-border"
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
