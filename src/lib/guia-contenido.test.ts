import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Raw HTML is not rendered (no rehype-raw), so `<commit>` outside code would
// silently vanish from the page and the PDF.
describe("docs/guia-usuario.md", () => {
  it("no tiene texto entre ángulos fuera de código", () => {
    const md = readFileSync(
      path.join(process.cwd(), "docs", "guia-usuario.md"),
      "utf-8",
    );
    const sinCodigo = md
      .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
      .replace(/`[^`\n]*`/g, "");
    expect(sinCodigo.match(/<[A-Za-z][^>\n]*>/g) ?? []).toEqual([]);
  });
});
