import { mkdir, mkdtemp, rm, symlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comprobarRuta } from "./rutaSegura";

// Junctions need no privileges on Windows and lstat reports them as links;
// if even that fails, the link cases are skipped.
async function puedeEnlazar(): Promise<boolean> {
  const dir = await mkdtemp(path.join(tmpdir(), "vicalba-enlace-"));
  try {
    await mkdir(path.join(dir, "a"));
    await symlink(path.join(dir, "a"), path.join(dir, "b"), "junction");
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const sinEnlaces = !(await puedeEnlazar());

describe("comprobarRuta", () => {
  let raiz: string;

  beforeAll(async () => {
    raiz = await mkdtemp(path.join(tmpdir(), "vicalba-raiz-"));
    await mkdir(path.join(raiz, "r", "c", "crm", "data", "media"), {
      recursive: true,
    });
    await writeFile(path.join(raiz, "r", "c", "crm", "fichero"), "x");
    await mkdir(path.join(raiz, "etc"));
    if (!sinEnlaces) {
      await symlink(
        path.join(raiz, "etc"),
        path.join(raiz, "r", "c", "crm", "enlace"),
        "junction",
      );
    }
  });

  afterAll(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("una carpeta normal → ok", async () => {
    expect(await comprobarRuta("/r/c/crm/data/media", raiz)).toBe("ok");
  });

  it("normaliza la ruta antes de recorrerla", async () => {
    expect(await comprobarRuta("/r/c/otro/../crm/data/", raiz)).toBe("ok");
  });

  it.skipIf(sinEnlaces)(
    "un componente intermedio que es un enlace → enlace",
    async () => {
      await mkdir(path.join(raiz, "etc", "sub"), { recursive: true });
      expect(await comprobarRuta("/r/c/crm/enlace/sub", raiz)).toBe("enlace");
    },
  );

  it.skipIf(sinEnlaces)(
    "el último componente es un enlace → enlace",
    async () => {
      expect(await comprobarRuta("/r/c/crm/enlace", raiz)).toBe("enlace");
    },
  );

  it("un fichero → no_carpeta", async () => {
    expect(await comprobarRuta("/r/c/crm/fichero", raiz)).toBe("no_carpeta");
  });

  it("un fichero en mitad de la ruta → no_existe", async () => {
    expect(await comprobarRuta("/r/c/crm/fichero/x", raiz)).toBe("no_existe");
  });

  it("una ruta inexistente → no_existe", async () => {
    expect(await comprobarRuta("/r/c/crm/nada", raiz)).toBe("no_existe");
  });

  it("una ruta relativa → no_existe", async () => {
    expect(await comprobarRuta("r/c/crm", raiz)).toBe("no_existe");
  });

  it("usa /hostroot por defecto", async () => {
    expect(await comprobarRuta("/r/c/crm/data/media")).toBe("no_existe");
  });
});
