import { createHmac, timingSafeEqual } from "node:crypto";

export function verificarFirmaGitHub(
  body: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const received = signature.slice("sha256=".length);

  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received, "hex"),
    );
  } catch {
    return false;
  }
}

function normalizarRepoUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^(https?|ssh):\/\//, "")
    .replace(/^git@([^:/]+):/, "$1/")
    .replace(/^git@/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

export function mismoRepositorio(a: string, b: string): boolean {
  return normalizarRepoUrl(a) === normalizarRepoUrl(b);
}
