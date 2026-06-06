import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function cifrar(valor: string): {
  valorCifrado: string;
  iv: string;
  authTag: string;
} {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(valor, "utf8"),
    cipher.final(),
  ]);
  return {
    valorCifrado: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function descifrar(
  valorCifrado: string,
  iv: string,
  authTag: string,
): string {
  const key = Buffer.from(env.ENCRYPTION_KEY, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(valorCifrado, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
