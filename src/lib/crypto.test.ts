import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { ENCRYPTION_KEY: "a".repeat(64) },
}));

import { cifrar, descifrar } from "./crypto";

describe("cifrar + descifrar", () => {
  it("roundtrip: descifrar(cifrar(valor)) === valor", () => {
    const { valorCifrado, iv, authTag } = cifrar("mi-secret-123");
    expect(descifrar(valorCifrado, iv, authTag)).toBe("mi-secret-123");
  });

  it("roundtrip con valor vacío", () => {
    const { valorCifrado, iv, authTag } = cifrar("");
    expect(descifrar(valorCifrado, iv, authTag)).toBe("");
  });

  it("roundtrip con caracteres especiales y unicode", () => {
    const valor = "p@ssw0rd!#$%^&*()_+áéíóú";
    const { valorCifrado, iv, authTag } = cifrar(valor);
    expect(descifrar(valorCifrado, iv, authTag)).toBe(valor);
  });

  it("genera IV distinto en cada llamada a cifrar", () => {
    const r1 = cifrar("mismo-valor");
    const r2 = cifrar("mismo-valor");
    expect(r1.iv).not.toBe(r2.iv);
  });

  it("genera valorCifrado distinto en cada llamada aunque el valor sea igual", () => {
    const r1 = cifrar("mismo-valor");
    const r2 = cifrar("mismo-valor");
    expect(r1.valorCifrado).not.toBe(r2.valorCifrado);
  });

  it("lanza error si el authTag es inválido (integridad comprometida)", () => {
    const { valorCifrado, iv } = cifrar("secreto");
    const authTagFalso = "b".repeat(32);
    expect(() => descifrar(valorCifrado, iv, authTagFalso)).toThrow();
  });

  it("lanza error si el IV es incorrecto", () => {
    const { valorCifrado, authTag } = cifrar("secreto");
    const ivFalso = "c".repeat(24);
    expect(() => descifrar(valorCifrado, ivFalso, authTag)).toThrow();
  });
});
