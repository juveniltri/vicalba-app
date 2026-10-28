import { describe, expect, it } from "vitest";
import { generarClave, kitRecuperacion } from "./kit";

describe("generarClave", () => {
  it("genera 32 bytes aleatorios en base64url (43 caracteres) distintos cada vez", () => {
    const a = generarClave();
    const b = generarClave();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe("kitRecuperacion", () => {
  it("incluye repositorio, clave, recordatorio de ENCRYPTION_KEY y el procedimiento", () => {
    const kit = kitRecuperacion(
      "s3:https://s3.ejemplo.com/bucket/vicalba",
      "CLAVE",
    );
    expect(kit).toContain(
      "Repositorio:  s3:https://s3.ejemplo.com/bucket/vicalba",
    );
    expect(kit).toContain("Clave:        CLAVE");
    expect(kit).toContain("ENCRYPTION_KEY");
    expect(kit).toContain("docs/recuperacion.md");
  });

  it("local: el repositorio es la ruta y no hay credenciales de destino", () => {
    const kit = kitRecuperacion("/var/vicalba/backups/restic", "CLAVE");
    expect(kit).toContain("Repositorio:  /var/vicalba/backups/restic");
    expect(kit).toContain("Credenciales: ninguna");
    expect(kit).not.toContain("S3 / usuario SFTP");
  });
});
