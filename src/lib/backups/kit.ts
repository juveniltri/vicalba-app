import { randomBytes } from "node:crypto";

export function generarClave(): string {
  return randomBytes(32).toString("base64url");
}

export function kitRecuperacion(repositorio: string, clave: string): string {
  // A local repository is a plain path: restic URLs of S3/SFTP never start with "/".
  const credenciales = repositorio.startsWith("/")
    ? "Credenciales: ninguna (carpeta de la VPS; sácala de la VPS, ver docs/recuperacion.md)"
    : "Credenciales: las del destino (tu cuenta de S3 / usuario SFTP)";
  return [
    "Kit de recuperación — vicalba-app",
    `Repositorio:  ${repositorio}`,
    `Clave:        ${clave}`,
    credenciales,
    "ENCRYPTION_KEY: guárdala también; está en el .env de la VPS. Sin ella, las variables,",
    "                credenciales SSH y contraseñas restauradas no se pueden descifrar.",
    "Procedimiento: docs/recuperacion.md",
  ].join("\n");
}
