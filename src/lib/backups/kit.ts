import { randomBytes } from "node:crypto";

export function generarClave(): string {
  return randomBytes(32).toString("base64url");
}

export function kitRecuperacion(repositorio: string, clave: string): string {
  return [
    "Kit de recuperación — vicalba-app",
    `Repositorio:  ${repositorio}`,
    `Clave:        ${clave}`,
    "Credenciales: las del destino (tu cuenta de S3 / usuario SFTP)",
    "ENCRYPTION_KEY: guárdala también; está en el .env de la VPS. Sin ella, las variables,",
    "                credenciales SSH y contraseñas restauradas no se pueden descifrar.",
    "Procedimiento: docs/recuperacion.md",
  ].join("\n");
}
