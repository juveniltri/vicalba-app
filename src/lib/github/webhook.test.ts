import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mismoRepositorio, verificarFirmaGitHub } from "./webhook";

function firmarPayload(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verificarFirmaGitHub", () => {
  const secret = "super-secret-webhook-key";
  const body = JSON.stringify({ ref: "refs/heads/main" });

  it("retorna true con firma válida", () => {
    const signature = firmarPayload(body, secret);
    expect(verificarFirmaGitHub(body, signature, secret)).toBe(true);
  });

  it("retorna false con firma inválida", () => {
    expect(verificarFirmaGitHub(body, "sha256=invalida", secret)).toBe(false);
  });

  it("retorna false con secret vacío", () => {
    const signature = firmarPayload(body, secret);
    expect(verificarFirmaGitHub(body, signature, "")).toBe(false);
  });

  it("retorna false cuando la firma no tiene prefijo sha256=", () => {
    const hmac = createHmac("sha256", secret).update(body).digest("hex");
    expect(verificarFirmaGitHub(body, hmac, secret)).toBe(false);
  });
});

describe("mismoRepositorio", () => {
  it.each([
    ["https://github.com/org/repo", "https://github.com/org/repo.git"],
    ["https://github.com/org/repo/", "https://github.com/org/repo.git"],
    ["https://github.com/Org/Repo", "https://github.com/org/repo.git"],
    ["git@github.com:org/repo.git", "https://github.com/org/repo.git"],
    ["ssh://git@github.com/org/repo.git", "git@github.com:org/repo.git"],
  ])("%s equivale a %s", (guardada, recibida) => {
    expect(mismoRepositorio(guardada, recibida)).toBe(true);
  });

  it("distingue repositorios distintos", () => {
    expect(
      mismoRepositorio(
        "https://github.com/org/repo",
        "https://github.com/org/repo-2.git",
      ),
    ).toBe(false);
  });
});
