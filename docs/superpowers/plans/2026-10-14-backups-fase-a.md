# Backups fase A — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copias diarias cifradas de la BD del Panel y de la config de Traefik a un destino S3 o SFTP configurable, con historial, listado, restauración desde el Panel y procedimiento de recuperación sin VPS.

**Architecture:** restic dentro de la imagen del Panel. `src/lib/backups/` separa lo puro (entorno de restic, parsers, programación, kit) de lo que ejecuta procesos (restic, pg_dump/pg_restore) y de la orquestación (copia, restauración). Un router tRPC `backups` y una sección en Configuración exponen todo; `src/instrumentation.ts` arranca el programador y cierra operaciones huérfanas.

**Tech Stack:** Next.js 16, tRPC 11, Prisma 7 (PostgreSQL 16), Zod 4, Vitest 4, restic 0.18 y postgresql16-client (Alpine 3.24).

**Spec:** `docs/superpowers/specs/2026-10-14-backups-fase-a-design.md`

## Global Constraints

- Rama `feature/v2.2`; un commit por tarea, Conventional Commits en español; nunca `git add .` (ver la nota de `.env.example` en la memoria del proyecto: `git restore .env.example prisma/.env.example` antes de commitear y `rm` después).
- TDD en todo lo testeable: test en rojo → mínimo código → verde.
- `src/lib/backups/**` y `src/server/routers/backups.ts` al 100 % (se añaden a `thresholds` de `vitest.config.ts` en la tarea 9); componentes ≥ 80 %.
- Prohibido `any`; Zod en toda entrada externa (tRPC, JSON de restic).
- Secretos solo por variables de entorno a los procesos hijos, nunca en argumentos ni en logs.
- Procesos siempre con `spawn`/`execFile` y argumentos en array, nunca a través de un shell.
- Zona horaria de la programación: `Europe/Madrid`. Hora por defecto: 3. Retención fija: `--keep-daily 7 --keep-weekly 4`. Límite por operación: 60 minutos. Aviso del Dashboard: sin copia correcta en 26 h.
- Etiqueta de restic de la fase A: `panel`; host: `vicalba-panel`.
- Comentarios solo para el porqué, en inglés como el resto de `src/` (CLAUDE.md).
- Textos de la UI en español, con el vocabulario de CLAUDE.md (Panel, Proyecto, Cliente…).

## Review Focus

1. **Destino que acepta la conexión pero no la clave** (repositorio ya existente con otra clave): `guardarDestino` debe responder «La clave no abre el repositorio existente» y no guardar nada → test en la tarea 9.
2. **Panel parado a la hora programada y reinicios**: la copia se hace al arrancar y un segundo reinicio el mismo día no la repite → tests de `tocaCopia` en la tarea 7.
3. **Fallo a mitad de una copia** (pg_dump o restic fallan): fila en `error`, aviso enviado y carpeta temporal borrada siempre → tests en la tarea 6.
4. **Restaurar cuando la copia previa falla**: no se toca la BD → test en la tarea 8.
5. **Doble clic / dos pestañas lanzando operaciones**: la segunda recibe `CONFLICT` y no se crean dos filas `en_curso` → tests en las tareas 6 y 9.

---

## Mapa de ficheros

| Fichero                                                                                                     | Tarea | Responsabilidad                                          |
| ----------------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------- |
| `prisma/schema.prisma`, `prisma/migrations/20261020000000_backups/migration.sql`                            | 1     | Modelos y enums                                          |
| `src/lib/backups/repositorio.ts` (+test)                                                                    | 2     | Config resuelta → repositorio, env y args de restic      |
| `src/lib/backups/kit.ts` (+test)                                                                            | 2     | Clave y texto del kit                                    |
| `src/lib/backups/procesos.ts` (+test)                                                                       | 3     | `ejecutar()` genérico con spawn, entorno, señal y salida |
| `src/lib/backups/restic.ts` (+test)                                                                         | 3     | Comandos de restic y parsers de su JSON                  |
| `src/lib/backups/postgres.ts` (+test)                                                                       | 4     | Entorno PG desde `DATABASE_URL`, `pgDump`, `pgRestore`   |
| `src/lib/notificaciones/*`                                                                                  | 5     | Aviso «backup fallido»                                   |
| `src/lib/backups/configuracion.ts` (+test)                                                                  | 6     | Leer y descifrar `ConfiguracionBackup`                   |
| `src/lib/backups/operacion.ts` (+test)                                                                      | 6     | Registro único de operación en curso, huérfanos          |
| `src/lib/backups/copia.ts` (+test)                                                                          | 6     | Orquestar una copia                                      |
| `src/lib/backups/programacion.ts` (+test)                                                                   | 7     | `inicioDelDia`, `tocaCopia`, `proximaCopia` (puras)      |
| `src/lib/backups/programador.ts` (+test)                                                                    | 7     | Comprobación cada minuto                                 |
| `src/instrumentation.ts`                                                                                    | 7     | Huérfanos + programador al arrancar                      |
| `src/lib/backups/restaurar.ts` (+test)                                                                      | 8     | Orquestar una restauración                               |
| `src/server/routers/backups.ts` (+test), `_app.ts`, `vitest.config.ts`                                      | 9     | API                                                      |
| `Dockerfile`                                                                                                | 10    | restic + postgresql16-client                             |
| `src/app/(panel)/actions.ts`, `src/components/backups/*` (+tests), `src/app/(panel)/configuracion/page.tsx` | 11    | Sección Backups                                          |
| `src/components/dashboard/AtencionPanel.tsx`, `EstadoVps.tsx`, `src/app/(panel)/page.tsx`                   | 12    | Avisos en el Dashboard                                   |
| `docs/recuperacion.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/roadmap.md`                                      | 13    | Documentación                                            |
| —                                                                                                           | 14    | Verificación real (MinIO, SFTP, simulacro)               |

---

### Task 1: Modelos de datos y migración

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261020000000_backups/migration.sql`

**Interfaces:**

- Produces: modelos Prisma `ConfiguracionBackup`, `Backup` y enums `DestinoBackup`, `OperacionBackup`, `OrigenBackup`, `ResultadoBackup` (tipos generados en `@prisma/client`); relación `Credencial.configuracionesBackup`.

- [ ] **Step 1: Añadir al final de `prisma/schema.prisma`**

```prisma
enum DestinoBackup {
  s3
  sftp
}

enum OperacionBackup {
  copia
  restauracion
}

enum OrigenBackup {
  programado
  manual
  antes_de_restaurar
}

enum ResultadoBackup {
  en_curso
  exito
  error
}

model ConfiguracionBackup {
  id          String         @id @default("default")
  habilitado  Boolean        @default(false)
  // 0-23, Europe/Madrid
  hora        Int            @default(3)
  tipoDestino DestinoBackup?

  s3Endpoint         String?
  s3Bucket           String?
  s3Region           String?
  s3Prefijo          String?
  s3AccessKeyId      String?
  s3SecretKeyCifrada String?
  s3SecretKeyIv      String?
  s3SecretKeyTag     String?

  sftpHost         String?
  sftpPuerto       Int         @default(22)
  sftpUsuario      String?
  sftpRuta         String?
  sftpCredencialId String?
  sftpCredencial   Credencial? @relation(fields: [sftpCredencialId], references: [id], onDelete: SetNull)

  claveCifrada              String?
  claveIv                   String?
  claveTag                  String?
  claveConfirmadaEn         DateTime?
  repositorioInicializadoEn DateTime?
}

model Backup {
  id            String          @id @default(cuid())
  operacion     OperacionBackup @default(copia)
  origen        OrigenBackup
  resultado     ResultadoBackup @default(en_curso)
  iniciadoEn    DateTime        @default(now())
  finalizadoEn  DateTime?
  snapshotId    String?
  bytesAnadidos BigInt?
  error         String?         @db.Text

  @@index([iniciadoEn])
}
```

Y en `model Credencial`, después de `proyectos Proyecto[]`:

```prisma
  configuracionesBackup ConfiguracionBackup[]
```

- [ ] **Step 2: Generar la migración contra la BD local**

```bash
docker compose -f docker-compose.dev.yml up -d --wait
set -a; . ./.env.local; set +a
npx prisma migrate dev --name backups --create-only
```

Renombra la carpeta creada a `prisma/migrations/20261020000000_backups/` (las migraciones del repo usan fechas fijas). Revisa el SQL: debe crear los 4 enums, las 2 tablas, el índice `Backup_iniciadoEn_idx` y la FK `ConfiguracionBackup_sftpCredencialId_fkey ... ON DELETE SET NULL`.

- [ ] **Step 3: Aplicar y comprobar que el esquema cuadra (lo mismo que hace el CI)**

```bash
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npx prisma generate
npm run type-check
```

Expected: «No difference detected.» y type-check sin errores.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261020000000_backups
git commit -m "feat(backups): modelos ConfiguracionBackup y Backup"
```

---

### Task 2: Entorno de restic y kit de recuperación (lógica pura)

**Files:**

- Create: `src/lib/backups/repositorio.ts`, `src/lib/backups/repositorio.test.ts`
- Create: `src/lib/backups/kit.ts`, `src/lib/backups/kit.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type DestinoResuelto =
    | {
        tipo: "s3";
        endpoint: string;
        bucket: string;
        region: string | null;
        prefijo: string | null;
        accessKeyId: string;
        secretKey: string;
      }
    | {
        tipo: "sftp";
        host: string;
        puerto: number;
        usuario: string;
        ruta: string;
        clavePrivada: string;
      };
  export type ConfigResuelta = { destino: DestinoResuelto; clave: string };
  export function urlRepositorio(destino: DestinoResuelto): string;
  export function entornoRestic(
    config: ConfigResuelta,
    rutas: { cacheDir: string; knownHosts: string; ficheroClaveSsh: string },
  ): { env: Record<string, string>; args: string[] };
  export function generarClave(): string; // kit.ts
  export function kitRecuperacion(repositorio: string, clave: string): string; // kit.ts
  ```

- [ ] **Step 1: Test de `urlRepositorio` y `entornoRestic` (rojo)**

`src/lib/backups/repositorio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  entornoRestic,
  urlRepositorio,
  type ConfigResuelta,
} from "./repositorio";

const rutas = {
  cacheDir: "/var/vicalba/repos/.backups/cache",
  knownHosts: "/var/vicalba/repos/.backups/known_hosts",
  ficheroClaveSsh: "/tmp/vicalba-backup-ssh/clave",
};

const s3: ConfigResuelta = {
  clave: "clave-restic",
  destino: {
    tipo: "s3",
    endpoint: "https://s3.eu-central-003.backblazeb2.com",
    bucket: "mi-bucket",
    region: "eu-central-003",
    prefijo: "vicalba",
    accessKeyId: "AKID",
    secretKey: "SECRETO",
  },
};

const sftp: ConfigResuelta = {
  clave: "clave-restic",
  destino: {
    tipo: "sftp",
    host: "backup.ejemplo.com",
    puerto: 2222,
    usuario: "copias",
    ruta: "/srv/vicalba",
    clavePrivada: "-----BEGIN OPENSSH PRIVATE KEY-----\n...",
  },
};

describe("urlRepositorio", () => {
  it("S3: endpoint, bucket y prefijo", () => {
    expect(urlRepositorio(s3.destino)).toBe(
      "s3:https://s3.eu-central-003.backblazeb2.com/mi-bucket/vicalba",
    );
  });

  it("S3 sin prefijo y con / final en el endpoint", () => {
    expect(
      urlRepositorio({
        ...s3.destino,
        endpoint: "https://r2.ejemplo.com/",
        prefijo: null,
      } as never),
    ).toBe("s3:https://r2.ejemplo.com/mi-bucket");
  });

  it("SFTP: usuario, host y ruta absoluta", () => {
    expect(urlRepositorio(sftp.destino)).toBe(
      "sftp:copias@backup.ejemplo.com:/srv/vicalba",
    );
  });
});

describe("entornoRestic", () => {
  it("S3: clave y credenciales solo en variables de entorno", () => {
    const { env, args } = entornoRestic(s3, rutas);
    expect(env).toEqual({
      RESTIC_REPOSITORY:
        "s3:https://s3.eu-central-003.backblazeb2.com/mi-bucket/vicalba",
      RESTIC_PASSWORD: "clave-restic",
      RESTIC_CACHE_DIR: rutas.cacheDir,
      AWS_ACCESS_KEY_ID: "AKID",
      AWS_SECRET_ACCESS_KEY: "SECRETO",
      AWS_DEFAULT_REGION: "eu-central-003",
    });
    expect(args).toEqual([]);
    expect(args.join(" ")).not.toContain("SECRETO");
  });

  it("S3 sin región no define AWS_DEFAULT_REGION", () => {
    const { env } = entornoRestic(
      { ...s3, destino: { ...s3.destino, region: null } as never },
      rutas,
    );
    expect(env).not.toHaveProperty("AWS_DEFAULT_REGION");
  });

  it("SFTP: sftp.command con la clave, el puerto y known_hosts persistente", () => {
    const { env, args } = entornoRestic(sftp, rutas);
    expect(env.RESTIC_REPOSITORY).toBe(
      "sftp:copias@backup.ejemplo.com:/srv/vicalba",
    );
    expect(env.RESTIC_PASSWORD).toBe("clave-restic");
    expect(args).toEqual([
      "-o",
      `sftp.command=ssh -i ${rutas.ficheroClaveSsh} -p 2222 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${rutas.knownHosts} copias@backup.ejemplo.com -s sftp`,
    ]);
    expect(JSON.stringify({ env, args })).not.toContain("BEGIN OPENSSH");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/backups/repositorio.test.ts`
Expected: FAIL «Cannot find module './repositorio'».

- [ ] **Step 3: Implementar `src/lib/backups/repositorio.ts`**

```ts
export type DestinoResuelto =
  | {
      tipo: "s3";
      endpoint: string;
      bucket: string;
      region: string | null;
      prefijo: string | null;
      accessKeyId: string;
      secretKey: string;
    }
  | {
      tipo: "sftp";
      host: string;
      puerto: number;
      usuario: string;
      ruta: string;
      clavePrivada: string;
    };

export type ConfigResuelta = { destino: DestinoResuelto; clave: string };

export function urlRepositorio(destino: DestinoResuelto): string {
  if (destino.tipo === "s3") {
    const partes = [destino.endpoint.replace(/\/+$/, ""), destino.bucket];
    if (destino.prefijo) partes.push(destino.prefijo);
    return `s3:${partes.join("/")}`;
  }
  return `sftp:${destino.usuario}@${destino.host}:${destino.ruta}`;
}

// Secrets travel only in the environment: process arguments are visible to
// anyone who can list processes in the container.
export function entornoRestic(
  config: ConfigResuelta,
  rutas: { cacheDir: string; knownHosts: string; ficheroClaveSsh: string },
): { env: Record<string, string>; args: string[] } {
  const { destino } = config;
  const env: Record<string, string> = {
    RESTIC_REPOSITORY: urlRepositorio(destino),
    RESTIC_PASSWORD: config.clave,
    RESTIC_CACHE_DIR: rutas.cacheDir,
  };
  if (destino.tipo === "s3") {
    env.AWS_ACCESS_KEY_ID = destino.accessKeyId;
    env.AWS_SECRET_ACCESS_KEY = destino.secretKey;
    if (destino.region) env.AWS_DEFAULT_REGION = destino.region;
    return { env, args: [] };
  }
  // accept-new trusts the server key on first use and enforces it afterwards.
  const ssh = [
    `ssh -i ${rutas.ficheroClaveSsh}`,
    `-p ${destino.puerto}`,
    "-o StrictHostKeyChecking=accept-new",
    `-o UserKnownHostsFile=${rutas.knownHosts}`,
    `${destino.usuario}@${destino.host}`,
    "-s sftp",
  ].join(" ");
  return { env, args: ["-o", `sftp.command=${ssh}`] };
}
```

- [ ] **Step 4: Verde**

Run: `npx vitest run src/lib/backups/repositorio.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Test del kit (rojo)**

`src/lib/backups/kit.test.ts`:

```ts
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
});
```

- [ ] **Step 6: Ver fallar** — `npx vitest run src/lib/backups/kit.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 7: Implementar `src/lib/backups/kit.ts`**

```ts
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
```

- [ ] **Step 8: Verde y cobertura**

Run: `npx vitest run src/lib/backups --coverage --coverage.include='src/lib/backups/**'`
Expected: todo en verde; `repositorio.ts` y `kit.ts` al 100 %.

- [ ] **Step 9: Commit**

```bash
git add src/lib/backups/repositorio.ts src/lib/backups/repositorio.test.ts src/lib/backups/kit.ts src/lib/backups/kit.test.ts
git commit -m "feat(backups): entorno de restic y kit de recuperación"
```

---

### Task 3: Ejecución de procesos y comandos de restic

**Files:**

- Create: `src/lib/backups/procesos.ts`, `src/lib/backups/procesos.test.ts`
- Create: `src/lib/backups/restic.ts`, `src/lib/backups/restic.test.ts`

**Interfaces:**

- Consumes: nada de tareas anteriores (recibe `env`/`args` ya construidos).
- Produces:

  ```ts
  // procesos.ts
  export class ErrorProceso extends Error {
    codigo: number | null;
    salida: string;
  }
  export function ejecutar(
    comando: string,
    args: string[],
    opciones: {
      env?: Record<string, string>;
      cwd?: string;
      signal?: AbortSignal;
    },
  ): Promise<string>; // stdout; rechaza con ErrorProceso (mensaje = últimas líneas de stderr)
  // restic.ts
  export type Restic = {
    env: Record<string, string>;
    args: string[];
    signal?: AbortSignal;
  };
  export type Snapshot = { id: string; fecha: Date; bytes: number | null };
  export async function abrirOInicializar(
    r: Restic,
  ): Promise<"existente" | "inicializado">;
  export async function crearSnapshot(
    r: Restic,
    carpeta: string,
  ): Promise<{ snapshotId: string; bytesAnadidos: number }>;
  export async function aplicarRetencion(r: Restic): Promise<void>;
  export async function listarSnapshots(r: Restic): Promise<Snapshot[]>;
  export async function restaurarSnapshot(
    r: Restic,
    snapshotId: string,
    destino: string,
  ): Promise<void>;
  export function parsearResumenBackup(salida: string): {
    snapshotId: string;
    bytesAnadidos: number;
  };
  export function parsearSnapshots(salida: string): Snapshot[];
  ```

- [ ] **Step 1: Test de `ejecutar` (rojo)**

`src/lib/backups/procesos.test.ts` usa procesos reales de Node para no mockear `spawn` (rápido y multiplataforma):

```ts
import { describe, expect, it } from "vitest";
import { ErrorProceso, ejecutar } from "./procesos";

const node = process.execPath;

describe("ejecutar", () => {
  it("devuelve stdout y pasa el entorno indicado", async () => {
    const salida = await ejecutar(
      node,
      ["-e", "process.stdout.write(process.env.PRUEBA ?? '')"],
      {
        env: { PRUEBA: "hola" },
      },
    );
    expect(salida).toBe("hola");
  });

  it("rechaza con el código y las últimas líneas de stderr", async () => {
    const err = await ejecutar(
      node,
      ["-e", "console.error('linea 1\\nfatal: algo falló'); process.exit(3)"],
      {},
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorProceso);
    expect((err as ErrorProceso).codigo).toBe(3);
    expect((err as ErrorProceso).message).toContain("fatal: algo falló");
  });

  it("se cancela con la señal", async () => {
    const controller = new AbortController();
    const promesa = ejecutar(node, ["-e", "setTimeout(() => {}, 10000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promesa).rejects.toThrow();
  });

  it("rechaza si el comando no existe", async () => {
    await expect(
      ejecutar("comando-que-no-existe-xyz", [], {}),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/backups/procesos.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/lib/backups/procesos.ts`**

```ts
import { spawn } from "node:child_process";

const LINEAS_ERROR = 15;

export class ErrorProceso extends Error {
  constructor(
    message: string,
    readonly codigo: number | null,
    readonly salida: string,
  ) {
    super(message);
    this.name = "ErrorProceso";
  }
}

// PATH and HOME come from the panel; everything else the child needs is passed
// explicitly so secrets never leak between commands.
export function ejecutar(
  comando: string,
  args: string[],
  opciones: {
    env?: Record<string, string>;
    cwd?: string;
    signal?: AbortSignal;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(comando, args, {
      cwd: opciones.cwd,
      signal: opciones.signal,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "/tmp",
        ...opciones.env,
      },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (codigo) => {
      if (codigo === 0) return resolve(stdout);
      const ultimas = stderr.trim().split("\n").slice(-LINEAS_ERROR).join("\n");
      reject(
        new ErrorProceso(
          `${comando} terminó con código ${codigo}${ultimas ? `:\n${ultimas}` : ""}`,
          codigo,
          stdout,
        ),
      );
    });
  });
}
```

- [ ] **Step 4: Verde** — `npx vitest run src/lib/backups/procesos.test.ts` → 4 passed.

- [ ] **Step 5: Test de restic (rojo)**

`src/lib/backups/restic.test.ts` mockea `./procesos` y fija las salidas JSON de restic 0.18:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEjecutar } = vi.hoisted(() => ({ mockEjecutar: vi.fn() }));
vi.mock("./procesos", async (original) => ({
  ...(await original<typeof import("./procesos")>()),
  ejecutar: mockEjecutar,
}));

import { ErrorProceso } from "./procesos";
import {
  abrirOInicializar,
  aplicarRetencion,
  crearSnapshot,
  listarSnapshots,
  parsearResumenBackup,
  parsearSnapshots,
  restaurarSnapshot,
  type Restic,
} from "./restic";

const r: Restic = {
  env: { RESTIC_PASSWORD: "x" },
  args: ["-o", "sftp.command=ssh"],
};

const SALIDA_BACKUP = [
  '{"message_type":"status","percent_done":0.5}',
  '{"message_type":"summary","files_new":3,"data_added":123456,"snapshot_id":"4f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a"}',
].join("\n");

const SALIDA_SNAPSHOTS = JSON.stringify([
  {
    id: "aaa111",
    time: "2026-10-12T01:00:03.1+00:00",
    tags: ["panel"],
    summary: { total_bytes_processed: 2048 },
  },
  { id: "bbb222", time: "2026-10-13T01:00:02.9+00:00", tags: ["panel"] },
]);

beforeEach(() => vi.clearAllMocks());

describe("parsearResumenBackup", () => {
  it("lee snapshot_id y data_added de la línea summary", () => {
    expect(parsearResumenBackup(SALIDA_BACKUP)).toEqual({
      snapshotId:
        "4f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a",
      bytesAnadidos: 123456,
    });
  });

  it("falla si restic no devolvió resumen", () => {
    expect(() => parsearResumenBackup('{"message_type":"status"}')).toThrow(
      "restic no devolvió el resumen de la copia",
    );
  });
});

describe("parsearSnapshots", () => {
  it("ordena de más reciente a más antigua y lee el tamaño si existe", () => {
    expect(parsearSnapshots(SALIDA_SNAPSHOTS)).toEqual([
      {
        id: "bbb222",
        fecha: new Date("2026-10-13T01:00:02.9+00:00"),
        bytes: null,
      },
      {
        id: "aaa111",
        fecha: new Date("2026-10-12T01:00:03.1+00:00"),
        bytes: 2048,
      },
    ]);
  });

  it("acepta la lista vacía y rechaza un JSON con otra forma", () => {
    expect(parsearSnapshots("[]")).toEqual([]);
    expect(() => parsearSnapshots('{"no":"lista"}')).toThrow();
  });
});

describe("abrirOInicializar", () => {
  it("reutiliza un repositorio existente si la clave lo abre", async () => {
    mockEjecutar.mockResolvedValueOnce("{}");
    expect(await abrirOInicializar(r)).toBe("existente");
    expect(mockEjecutar).toHaveBeenCalledWith(
      "restic",
      ["-o", "sftp.command=ssh", "cat", "config"],
      {
        env: r.env,
        signal: undefined,
      },
    );
  });

  it("inicializa si el repositorio no existe (código 10)", async () => {
    mockEjecutar
      .mockRejectedValueOnce(new ErrorProceso("no existe", 10, ""))
      .mockResolvedValueOnce("{}");
    expect(await abrirOInicializar(r)).toBe("inicializado");
    expect(mockEjecutar).toHaveBeenLastCalledWith(
      "restic",
      ["-o", "sftp.command=ssh", "init"],
      {
        env: r.env,
        signal: undefined,
      },
    );
  });

  it("explica que la clave no abre el repositorio (código 12)", async () => {
    mockEjecutar.mockRejectedValueOnce(new ErrorProceso("mala clave", 12, ""));
    await expect(abrirOInicializar(r)).rejects.toThrow(
      "La clave no abre el repositorio existente",
    );
  });

  it("propaga cualquier otro error (red, credenciales)", async () => {
    mockEjecutar.mockRejectedValueOnce(
      new ErrorProceso("403 Forbidden", 1, ""),
    );
    await expect(abrirOInicializar(r)).rejects.toThrow("403 Forbidden");
  });
});

describe("comandos", () => {
  it("crearSnapshot: etiqueta panel, host fijo y carpeta como directorio de trabajo", async () => {
    mockEjecutar.mockResolvedValueOnce(SALIDA_BACKUP);
    const res = await crearSnapshot(r, "/tmp/copia");
    expect(res.bytesAnadidos).toBe(123456);
    expect(mockEjecutar).toHaveBeenCalledWith(
      "restic",
      [
        "-o",
        "sftp.command=ssh",
        "backup",
        "--json",
        "--tag",
        "panel",
        "--host",
        "vicalba-panel",
        ".",
      ],
      { env: r.env, cwd: "/tmp/copia", signal: undefined },
    );
  });

  it("aplicarRetencion: 7 diarias y 4 semanales por etiqueta", async () => {
    mockEjecutar.mockResolvedValueOnce("[]");
    await aplicarRetencion(r);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "forget",
      "--json",
      "--tag",
      "panel",
      "--group-by",
      "host,tags",
      "--keep-daily",
      "7",
      "--keep-weekly",
      "4",
      "--prune",
    ]);
  });

  it("listarSnapshots: solo los de la etiqueta panel", async () => {
    mockEjecutar.mockResolvedValueOnce(SALIDA_SNAPSHOTS);
    expect(await listarSnapshots(r)).toHaveLength(2);
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "snapshots",
      "--json",
      "--tag",
      "panel",
    ]);
  });

  it("restaurarSnapshot: restaura el snapshot en la carpeta indicada", async () => {
    mockEjecutar.mockResolvedValueOnce("");
    await restaurarSnapshot(r, "bbb222", "/tmp/restaurar");
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "-o",
      "sftp.command=ssh",
      "restore",
      "bbb222",
      "--target",
      "/tmp/restaurar",
    ]);
  });
});
```

- [ ] **Step 6: Ver fallar** — `npx vitest run src/lib/backups/restic.test.ts` → FAIL.

- [ ] **Step 7: Implementar `src/lib/backups/restic.ts`**

```ts
import { z } from "zod";
import { ErrorProceso, ejecutar } from "./procesos";

export type Restic = {
  env: Record<string, string>;
  args: string[];
  signal?: AbortSignal;
};
export type Snapshot = { id: string; fecha: Date; bytes: number | null };

const ETIQUETA = "panel";
const HOST = "vicalba-panel";
// restic exit codes (0.17+): 10 = repository does not exist, 12 = wrong password.
const SIN_REPOSITORIO = 10;
const CLAVE_INCORRECTA = 12;

function restic(r: Restic, args: string[], cwd?: string): Promise<string> {
  return ejecutar("restic", [...r.args, ...args], {
    env: r.env,
    signal: r.signal,
    ...(cwd ? { cwd } : {}),
  });
}

const resumenSchema = z.object({
  message_type: z.literal("summary"),
  snapshot_id: z.string(),
  data_added: z.number(),
});

export function parsearResumenBackup(salida: string): {
  snapshotId: string;
  bytesAnadidos: number;
} {
  for (const linea of salida.trim().split("\n").reverse()) {
    const r = resumenSchema.safeParse(JSON.parse(linea));
    if (r.success) {
      return {
        snapshotId: r.data.snapshot_id,
        bytesAnadidos: r.data.data_added,
      };
    }
  }
  throw new Error("restic no devolvió el resumen de la copia");
}

const snapshotsSchema = z.array(
  z.object({
    id: z.string(),
    time: z.string(),
    summary: z.object({ total_bytes_processed: z.number() }).optional(),
  }),
);

export function parsearSnapshots(salida: string): Snapshot[] {
  return snapshotsSchema
    .parse(JSON.parse(salida))
    .map((s) => ({
      id: s.id,
      fecha: new Date(s.time),
      bytes: s.summary?.total_bytes_processed ?? null,
    }))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export async function abrirOInicializar(
  r: Restic,
): Promise<"existente" | "inicializado"> {
  try {
    await restic(r, ["cat", "config"]);
    return "existente";
  } catch (err) {
    if (err instanceof ErrorProceso && err.codigo === SIN_REPOSITORIO) {
      await restic(r, ["init"]);
      return "inicializado";
    }
    if (err instanceof ErrorProceso && err.codigo === CLAVE_INCORRECTA) {
      throw new Error("La clave no abre el repositorio existente");
    }
    throw err;
  }
}

export async function crearSnapshot(
  r: Restic,
  carpeta: string,
): Promise<{ snapshotId: string; bytesAnadidos: number }> {
  const salida = await restic(
    r,
    ["backup", "--json", "--tag", ETIQUETA, "--host", HOST, "."],
    carpeta,
  );
  return parsearResumenBackup(salida);
}

export async function aplicarRetencion(r: Restic): Promise<void> {
  await restic(r, [
    "forget",
    "--json",
    "--tag",
    ETIQUETA,
    "--group-by",
    "host,tags",
    "--keep-daily",
    "7",
    "--keep-weekly",
    "4",
    "--prune",
  ]);
}

export async function listarSnapshots(r: Restic): Promise<Snapshot[]> {
  return parsearSnapshots(
    await restic(r, ["snapshots", "--json", "--tag", ETIQUETA]),
  );
}

export async function restaurarSnapshot(
  r: Restic,
  snapshotId: string,
  destino: string,
): Promise<void> {
  await restic(r, ["restore", snapshotId, "--target", destino]);
}
```

NOTE para el implementador: la llamada de `abrirOInicializar` en el test espera `{ env, signal: undefined }` (sin `cwd`); la de `crearSnapshot`, `{ env, cwd, signal }`. Si el orden de claves difiere, `toHaveBeenCalledWith` sigue pasando (compara por valor).

- [ ] **Step 8: Verde y cobertura 100 %**

Run: `npx vitest run src/lib/backups --coverage --coverage.include='src/lib/backups/**'`
Expected: todo verde; `procesos.ts` y `restic.ts` al 100 %.

- [ ] **Step 9: Commit**

```bash
git add src/lib/backups/procesos.ts src/lib/backups/procesos.test.ts src/lib/backups/restic.ts src/lib/backups/restic.test.ts
git commit -m "feat(backups): comandos de restic e interpretación de su salida"
```

---

### Task 4: pg_dump y pg_restore

**Files:**

- Create: `src/lib/backups/postgres.ts`, `src/lib/backups/postgres.test.ts`

**Interfaces:**

- Consumes: `ejecutar` (tarea 3).
- Produces:

  ```ts
  export function entornoPg(databaseUrl: string): Record<string, string>;
  export async function pgDump(
    databaseUrl: string,
    fichero: string,
    signal?: AbortSignal,
  ): Promise<void>;
  export async function pgRestore(
    databaseUrl: string,
    fichero: string,
    signal?: AbortSignal,
  ): Promise<void>;
  ```

- [ ] **Step 1: Test (rojo)** — `src/lib/backups/postgres.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEjecutar } = vi.hoisted(() => ({ mockEjecutar: vi.fn() }));
vi.mock("./procesos", () => ({ ejecutar: mockEjecutar }));

import { entornoPg, pgDump, pgRestore } from "./postgres";

const URL_BD = "postgresql://vicalba:p%40ss@db:5432/vicalba?schema=public";

beforeEach(() => {
  vi.clearAllMocks();
  mockEjecutar.mockResolvedValue("");
});

describe("entornoPg", () => {
  it("convierte DATABASE_URL en variables PG* con la contraseña decodificada", () => {
    expect(entornoPg(URL_BD)).toEqual({
      PGHOST: "db",
      PGPORT: "5432",
      PGUSER: "vicalba",
      PGPASSWORD: "p@ss",
      PGDATABASE: "vicalba",
    });
  });

  it("usa el puerto 5432 si la URL no lo indica", () => {
    expect(entornoPg("postgresql://u:p@db/bd").PGPORT).toBe("5432");
  });
});

describe("pgDump y pgRestore", () => {
  it("pg_dump en formato personalizado sin la contraseña en los argumentos", async () => {
    await pgDump(URL_BD, "/tmp/c/panel-db.dump");
    const [comando, args, opciones] = mockEjecutar.mock.calls[0]!;
    expect(comando).toBe("pg_dump");
    expect(args).toEqual(["--format=custom", "--file", "/tmp/c/panel-db.dump"]);
    expect(JSON.stringify(args)).not.toContain("p@ss");
    expect(opciones.env.PGPASSWORD).toBe("p@ss");
  });

  it("pg_restore limpia, en una sola transacción y sin propietarios", async () => {
    await pgRestore(URL_BD, "/tmp/r/panel-db.dump");
    expect(mockEjecutar.mock.calls[0]![0]).toBe("pg_restore");
    expect(mockEjecutar.mock.calls[0]![1]).toEqual([
      "--clean",
      "--if-exists",
      "--single-transaction",
      "--no-owner",
      "--dbname",
      "vicalba",
      "/tmp/r/panel-db.dump",
    ]);
  });
});
```

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/backups/postgres.test.ts` → FAIL.

- [ ] **Step 3: Implementar `src/lib/backups/postgres.ts`**

```ts
import { ejecutar } from "./procesos";

// libpq reads the connection from PG* variables, so the password never shows
// up in the process list.
export function entornoPg(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
  };
}

export async function pgDump(
  databaseUrl: string,
  fichero: string,
  signal?: AbortSignal,
): Promise<void> {
  await ejecutar("pg_dump", ["--format=custom", "--file", fichero], {
    env: entornoPg(databaseUrl),
    signal,
  });
}

export async function pgRestore(
  databaseUrl: string,
  fichero: string,
  signal?: AbortSignal,
): Promise<void> {
  const env = entornoPg(databaseUrl);
  await ejecutar(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--single-transaction",
      "--no-owner",
      "--dbname",
      env.PGDATABASE!,
      fichero,
    ],
    { env, signal },
  );
}
```

- [ ] **Step 4: Verde** — `npx vitest run src/lib/backups/postgres.test.ts` → 4 passed, 100 %.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backups/postgres.ts src/lib/backups/postgres.test.ts
git commit -m "feat(backups): pg_dump y pg_restore sin la contraseña en los argumentos"
```

---

### Task 5: Aviso «backup fallido» por los canales de notificación

**Files:**

- Modify: `src/lib/notificaciones/index.ts` (tipo `PayloadNotificacion`, nueva `notificarFalloBackup`)
- Modify: `src/lib/notificaciones/webhook.ts:31` (título), `src/lib/notificaciones/telegram.ts:15`, `src/lib/notificaciones/email.ts:30`
- Test: `src/lib/notificaciones/index.test.ts`, `webhook.test.ts`, `telegram.test.ts`, `email.test.ts`

**Interfaces:**

- Produces:

  ```ts
  // PayloadNotificacion gana un campo opcional:
  evento?: "deploy" | "backup"; // ausente = "deploy"
  export async function notificarFalloBackup(datos: {
    operacion: "copia" | "restauracion";
    origen: "programado" | "manual" | "antes_de_restaurar";
    error: string;
  }): Promise<void>;
  ```

- [ ] **Step 1: Tests de títulos (rojo).** En cada test de canal añade un caso con `evento: "backup"`. Ejemplo para Telegram (`telegram.test.ts`, mismo estilo que sus casos actuales con `fetch` mockeado):

```ts
it("titula «Backup» los avisos de backup", async () => {
  await enviarTelegram("token", "chat", {
    ...payloadBase,
    evento: "backup",
    resultado: "error",
  });
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
  expect(body.text.split("\n")[0]).toBe("❌ Backup error — panel");
});
```

Y en `index.test.ts`:

```ts
describe("notificarFalloBackup", () => {
  it("envía un payload de backup con el motivo como salida", async () => {
    mockFindUnique.mockResolvedValue({ ...configSoloWebhook });
    await notificarFalloBackup({
      operacion: "copia",
      origen: "programado",
      error: "403 Forbidden",
    });
    expect(mockEnviarWebhook).toHaveBeenCalledWith(
      "https://hooks.ejemplo.com",
      {
        evento: "backup",
        proyectoNombre: "panel",
        clienteSlug: "backups",
        rama: "copia programada",
        sha: null,
        resultado: "error",
        output: "403 Forbidden",
      },
    );
  });
});
```

(Usa los nombres de mocks y fixtures que ya existen en cada fichero de test; `configSoloWebhook` = la config con solo el webhook habilitado.)

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/notificaciones` → FAIL en los casos nuevos.

- [ ] **Step 3: Implementar.** En `index.ts`:

```ts
export interface PayloadNotificacion {
  evento?: "deploy" | "backup";
  proyectoNombre: string;
  // ...resto igual
}

const ORIGEN_BACKUP = {
  programado: "programada",
  manual: "manual",
  antes_de_restaurar: "antes de restaurar",
} as const;

export async function notificarFalloBackup(datos: {
  operacion: "copia" | "restauracion";
  origen: keyof typeof ORIGEN_BACKUP;
  error: string;
}): Promise<void> {
  await enviarNotificacion({
    evento: "backup",
    proyectoNombre: "panel",
    clienteSlug: "backups",
    rama:
      datos.operacion === "copia"
        ? `copia ${ORIGEN_BACKUP[datos.origen]}`
        : "restauración",
    sha: null,
    resultado: "error",
    output: datos.error,
  });
}
```

En los tres canales, sustituye la palabra fija `Deploy` por:

```ts
const titulo = payload.evento === "backup" ? "Backup" : "Deploy";
```

(`webhook.ts:31` usa `p` en lugar de `payload`.) Comprueba que el embed de Discord y el texto de Slack usan esa misma función de título (en `webhook.ts` el título sale de una única función en la línea 31).

- [ ] **Step 4: Verde** — `npx vitest run src/lib/notificaciones` → todo en verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones
git commit -m "feat(notificaciones): aviso de backup fallido"
```

---

### Task 6: Configuración resuelta, operación en curso y copia

**Files:**

- Create: `src/lib/backups/configuracion.ts` (+test), `src/lib/backups/operacion.ts` (+test), `src/lib/backups/copia.ts` (+test)

**Interfaces:**

- Consumes: `ConfigResuelta`, `entornoRestic`, `urlRepositorio` (t.2); `ejecutar` (t.3); `crearSnapshot`, `aplicarRetencion`, `type Restic` (t.3); `pgDump` (t.4); `notificarFalloBackup` (t.5); `cifrar`/`descifrar`; `leerFicheroTraefik(ruta: string): Promise<string>` de `@/lib/docker/traefik`; `env`.
- Produces:

  ```ts
  // configuracion.ts
  export class BackupsNoConfigurados extends Error {}
  export async function cargarConfigResuelta(): Promise<ConfigResuelta>; // lanza BackupsNoConfigurados
  export async function conRestic<T>(
    config: ConfigResuelta,
    signal: AbortSignal | undefined,
    fn: (r: Restic) => Promise<T>,
  ): Promise<T>; // escribe/borra la clave SSH temporal
  export const RUTAS_BACKUP: {
    base: string;
    cacheDir: string;
    knownHosts: string;
  };
  // operacion.ts
  export class OperacionEnCurso extends Error {}
  export const LIMITE_MS = 60 * 60 * 1000;
  export function tomarOperacion(): AbortController; // lanza OperacionEnCurso
  export function soltarOperacion(): void;
  export function hayOperacionEnCurso(): boolean;
  export async function limpiarBackupsHuerfanos(
    motivo: string,
  ): Promise<number>;
  // copia.ts
  export async function hacerCopia(
    backupId: string,
    config: ConfigResuelta,
    signal: AbortSignal,
  ): Promise<void>;
  export async function iniciarCopia(
    origen: "programado" | "manual",
  ): Promise<{ id: string }>;
  ```

- [ ] **Step 1: Tests de `operacion.ts` (rojo)**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateMany } = vi.hoisted(() => ({ mockUpdateMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { backup: { updateMany: mockUpdateMany } },
}));

import {
  OperacionEnCurso,
  hayOperacionEnCurso,
  limpiarBackupsHuerfanos,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";

beforeEach(() => {
  soltarOperacion();
  vi.clearAllMocks();
});

describe("operación única", () => {
  it("una segunda operación se rechaza hasta soltar la primera", () => {
    const c = tomarOperacion();
    expect(c).toBeInstanceOf(AbortController);
    expect(hayOperacionEnCurso()).toBe(true);
    expect(() => tomarOperacion()).toThrow(OperacionEnCurso);
    soltarOperacion();
    expect(hayOperacionEnCurso()).toBe(false);
    expect(() => tomarOperacion()).not.toThrow();
  });
});

describe("limpiarBackupsHuerfanos", () => {
  it("marca como error las operaciones en curso de un proceso anterior", async () => {
    mockUpdateMany.mockResolvedValue({ count: 2 });
    expect(
      await limpiarBackupsHuerfanos("Interrumpido por reinicio del panel"),
    ).toBe(2);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { resultado: "en_curso" },
      data: {
        resultado: "error",
        error: "Interrumpido por reinicio del panel",
        finalizadoEn: expect.any(Date),
      },
    });
  });
});
```

- [ ] **Step 2: Implementar `src/lib/backups/operacion.ts`**

```ts
import { prisma } from "@/lib/prisma";

export const LIMITE_MS = 60 * 60 * 1000;

export class OperacionEnCurso extends Error {
  constructor() {
    super("Ya hay una copia o restauración en curso");
    this.name = "OperacionEnCurso";
  }
}

// NOTE: globalThis because tRPC, server actions and the scheduler live in
// different route bundles but must see the same lock.
const global = globalThis as unknown as { operacionBackup?: AbortController };

export function tomarOperacion(): AbortController {
  if (global.operacionBackup) throw new OperacionEnCurso();
  global.operacionBackup = new AbortController();
  return global.operacionBackup;
}

export function soltarOperacion(): void {
  global.operacionBackup = undefined;
}

export function hayOperacionEnCurso(): boolean {
  return global.operacionBackup !== undefined;
}

// Called at startup: nothing can be running yet, so any en_curso row died
// with the previous process.
export async function limpiarBackupsHuerfanos(motivo: string): Promise<number> {
  const { count } = await prisma.backup.updateMany({
    where: { resultado: "en_curso" },
    data: { resultado: "error", error: motivo, finalizadoEn: new Date() },
  });
  return count;
}
```

- [ ] **Step 3: Verde** — `npx vitest run src/lib/backups/operacion.test.ts`.

- [ ] **Step 4: Tests de `configuracion.ts` (rojo)**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockEjecutarFs } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockEjecutarFs: {
    writeFile: vi.fn(),
    rm: vi.fn(),
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: { REPOS_DIR: "/var/vicalba/repos", ENCRYPTION_KEY: "0".repeat(64) },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { configuracionBackup: { findUnique: mockFindUnique } },
}));
vi.mock("@/lib/crypto", () => ({ descifrar: (v: string) => `claro(${v})` }));
vi.mock("node:fs/promises", () => mockEjecutarFs);

import {
  BackupsNoConfigurados,
  cargarConfigResuelta,
  conRestic,
  RUTAS_BACKUP,
} from "./configuracion";

const base = {
  habilitado: true,
  hora: 3,
  claveCifrada: "k",
  claveIv: "i",
  claveTag: "t",
  claveConfirmadaEn: new Date(),
  repositorioInicializadoEn: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEjecutarFs.mkdtemp.mockResolvedValue("/tmp/vicalba-ssh-1");
});

describe("cargarConfigResuelta", () => {
  it("S3: descifra la secret key y la clave", async () => {
    mockFindUnique.mockResolvedValue({
      ...base,
      tipoDestino: "s3",
      s3Endpoint: "https://s3.x",
      s3Bucket: "b",
      s3Region: null,
      s3Prefijo: "p",
      s3AccessKeyId: "AK",
      s3SecretKeyCifrada: "sk",
      s3SecretKeyIv: "i",
      s3SecretKeyTag: "t",
    });
    expect(await cargarConfigResuelta()).toEqual({
      clave: "claro(k)",
      destino: {
        tipo: "s3",
        endpoint: "https://s3.x",
        bucket: "b",
        region: null,
        prefijo: "p",
        accessKeyId: "AK",
        secretKey: "claro(sk)",
      },
    });
  });

  it("SFTP: descifra la clave privada de la credencial", async () => {
    mockFindUnique.mockResolvedValue({
      ...base,
      tipoDestino: "sftp",
      sftpHost: "h",
      sftpPuerto: 22,
      sftpUsuario: "u",
      sftpRuta: "/r",
      sftpCredencial: { clavePrivadaCifrada: "pk", iv: "i", authTag: "t" },
    });
    const c = await cargarConfigResuelta();
    expect(c.destino).toEqual({
      tipo: "sftp",
      host: "h",
      puerto: 22,
      usuario: "u",
      ruta: "/r",
      clavePrivada: "claro(pk)",
    });
  });

  it.each([
    ["sin fila", null],
    ["sin destino", { ...base, tipoDestino: null }],
    ["sin clave", { ...base, tipoDestino: "s3", claveCifrada: null }],
    ["S3 incompleto", { ...base, tipoDestino: "s3", s3Endpoint: null }],
    [
      "SFTP sin credencial",
      {
        ...base,
        tipoDestino: "sftp",
        sftpHost: "h",
        sftpUsuario: "u",
        sftpRuta: "/r",
        sftpCredencial: null,
      },
    ],
  ])("lanza BackupsNoConfigurados: %s", async (_, fila) => {
    mockFindUnique.mockResolvedValue(fila);
    await expect(cargarConfigResuelta()).rejects.toBeInstanceOf(
      BackupsNoConfigurados,
    );
  });
});

describe("conRestic", () => {
  it("SFTP: escribe la clave normalizada con permisos 600 y la borra aunque falle", async () => {
    const config = {
      clave: "c",
      destino: {
        tipo: "sftp" as const,
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "/r",
        clavePrivada: "KEY\r\n",
      },
    };
    await expect(
      conRestic(config, undefined, async () => {
        throw new Error("fallo");
      }),
    ).rejects.toThrow("fallo");
    expect(mockEjecutarFs.writeFile).toHaveBeenCalledWith(
      "/tmp/vicalba-ssh-1/clave",
      "KEY\n",
      { mode: 0o600 },
    );
    expect(mockEjecutarFs.rm).toHaveBeenCalledWith("/tmp/vicalba-ssh-1", {
      recursive: true,
      force: true,
    });
  });

  it("S3: no escribe ninguna clave y pasa el entorno a la función", async () => {
    const config = {
      clave: "c",
      destino: {
        tipo: "s3" as const,
        endpoint: "https://s3.x",
        bucket: "b",
        region: null,
        prefijo: null,
        accessKeyId: "a",
        secretKey: "s",
      },
    };
    const r = await conRestic(
      config,
      undefined,
      async (restic) => restic.env.RESTIC_CACHE_DIR,
    );
    expect(r).toBe(RUTAS_BACKUP.cacheDir);
    expect(mockEjecutarFs.writeFile).not.toHaveBeenCalled();
    expect(mockEjecutarFs.mkdir).toHaveBeenCalledWith(RUTAS_BACKUP.base, {
      recursive: true,
    });
  });
});
```

- [ ] **Step 5: Implementar `src/lib/backups/configuracion.ts`**

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import {
  entornoRestic,
  type ConfigResuelta,
  type DestinoResuelto,
} from "./repositorio";
import type { Restic } from "./restic";

export class BackupsNoConfigurados extends Error {
  constructor(motivo: string) {
    super(`Backups sin configurar: ${motivo}`);
    this.name = "BackupsNoConfigurados";
  }
}

const base = path.posix.join(env.REPOS_DIR, ".backups");
export const RUTAS_BACKUP = {
  base,
  cacheDir: path.posix.join(base, "cache"),
  knownHosts: path.posix.join(base, "known_hosts"),
};

export async function cargarConfigResuelta(): Promise<ConfigResuelta> {
  const c = await prisma.configuracionBackup.findUnique({
    where: { id: "default" },
    include: { sftpCredencial: true },
  });
  if (!c) throw new BackupsNoConfigurados("no hay configuración");
  if (!c.claveCifrada || !c.claveIv || !c.claveTag) {
    throw new BackupsNoConfigurados("falta la clave de cifrado");
  }
  const clave = descifrar(c.claveCifrada, c.claveIv, c.claveTag);

  let destino: DestinoResuelto;
  if (c.tipoDestino === "s3") {
    if (
      !c.s3Endpoint ||
      !c.s3Bucket ||
      !c.s3AccessKeyId ||
      !c.s3SecretKeyCifrada ||
      !c.s3SecretKeyIv ||
      !c.s3SecretKeyTag
    ) {
      throw new BackupsNoConfigurados("destino S3 incompleto");
    }
    destino = {
      tipo: "s3",
      endpoint: c.s3Endpoint,
      bucket: c.s3Bucket,
      region: c.s3Region,
      prefijo: c.s3Prefijo,
      accessKeyId: c.s3AccessKeyId,
      secretKey: descifrar(
        c.s3SecretKeyCifrada,
        c.s3SecretKeyIv,
        c.s3SecretKeyTag,
      ),
    };
  } else if (c.tipoDestino === "sftp") {
    if (!c.sftpHost || !c.sftpUsuario || !c.sftpRuta || !c.sftpCredencial) {
      throw new BackupsNoConfigurados("destino SFTP incompleto");
    }
    const cred = c.sftpCredencial;
    destino = {
      tipo: "sftp",
      host: c.sftpHost,
      puerto: c.sftpPuerto,
      usuario: c.sftpUsuario,
      ruta: c.sftpRuta,
      clavePrivada: descifrar(cred.clavePrivadaCifrada, cred.iv, cred.authTag),
    };
  } else {
    throw new BackupsNoConfigurados("no hay destino");
  }
  return { destino, clave };
}

export async function conRestic<T>(
  config: ConfigResuelta,
  signal: AbortSignal | undefined,
  fn: (r: Restic) => Promise<T>,
): Promise<T> {
  await mkdir(base, { recursive: true });
  const dirSsh =
    config.destino.tipo === "sftp"
      ? await mkdtemp(path.join(tmpdir(), "vicalba-ssh-"))
      : null;
  const ficheroClaveSsh = dirSsh ? path.posix.join(dirSsh, "clave") : "";
  try {
    if (dirSsh && config.destino.tipo === "sftp") {
      // ssh rejects keys without a trailing newline or with CRLF endings.
      const clave =
        config.destino.clavePrivada.replace(/\r\n/g, "\n").trimEnd() + "\n";
      await writeFile(ficheroClaveSsh, clave, { mode: 0o600 });
    }
    const { env: entorno, args } = entornoRestic(config, {
      cacheDir: RUTAS_BACKUP.cacheDir,
      knownHosts: RUTAS_BACKUP.knownHosts,
      ficheroClaveSsh,
    });
    return await fn({ env: entorno, args, signal });
  } finally {
    if (dirSsh) await rm(dirSsh, { recursive: true, force: true });
  }
}
```

NOTE: `path.join(tmpdir(), …)` en Windows devuelve rutas con `\`; el test fija `mkdtemp` a una ruta POSIX, así que solo `ficheroClaveSsh` usa `path.posix`. En producción (Linux) ambos coinciden.

- [ ] **Step 6: Verde** — `npx vitest run src/lib/backups/configuracion.test.ts`, 100 %.

- [ ] **Step 7: Tests de `copia.ts` (rojo)**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  cargar: vi.fn(),
  crearSnapshot: vi.fn(),
  retencion: vi.fn(),
  pgDump: vi.fn(),
  leerTraefik: vi.fn(),
  notificar: vi.fn(),
  fs: {
    mkdtemp: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rm: vi.fn(),
    cp: vi.fn(),
  },
}));
vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://u:p@db/bd",
    TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic",
    ACME_JSON_PATH: "/letsencrypt/acme.json",
    REPOS_DIR: "/r",
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { backup: { create: m.create, update: m.update } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("@/lib/docker/traefik", () => ({ leerFicheroTraefik: m.leerTraefik }));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("node:fs/promises", () => m.fs);
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("./restic", () => ({
  crearSnapshot: m.crearSnapshot,
  aplicarRetencion: m.retencion,
}));
vi.mock("./postgres", () => ({ pgDump: m.pgDump }));

import { iniciarCopia } from "./copia";
import {
  OperacionEnCurso,
  hayOperacionEnCurso,
  soltarOperacion,
} from "./operacion";

const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  soltarOperacion();
  m.create.mockResolvedValue({ id: "b1" });
  m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "s3" } });
  m.fs.mkdtemp.mockResolvedValue("/tmp/vicalba-backup-x");
  m.leerTraefik.mockResolvedValue('{"letsencrypt":{}}');
  m.crearSnapshot.mockResolvedValue({
    snapshotId: "snap1",
    bytesAnadidos: 4096,
  });
});

describe("iniciarCopia", () => {
  it("prepara dump + Traefik, sube, aplica retención, marca éxito y borra la carpeta", async () => {
    expect(await iniciarCopia("manual")).toEqual({ id: "b1" });
    await esperar();

    expect(m.create).toHaveBeenCalledWith({
      data: { operacion: "copia", origen: "manual" },
    });
    expect(m.pgDump).toHaveBeenCalledWith(
      "postgresql://u:p@db/bd",
      "/tmp/vicalba-backup-x/panel-db.dump",
      expect.any(AbortSignal),
    );
    expect(m.fs.cp).toHaveBeenCalledWith(
      "/etc/traefik/dynamic",
      "/tmp/vicalba-backup-x/traefik/dynamic",
      { recursive: true },
    );
    expect(m.fs.writeFile).toHaveBeenCalledWith(
      "/tmp/vicalba-backup-x/traefik/acme.json",
      '{"letsencrypt":{}}',
      { mode: 0o600 },
    );
    expect(m.crearSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      "/tmp/vicalba-backup-x",
    );
    expect(m.retencion).toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: {
        resultado: "exito",
        snapshotId: "snap1",
        bytesAnadidos: BigInt(4096),
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.fs.rm).toHaveBeenCalledWith("/tmp/vicalba-backup-x", {
      recursive: true,
      force: true,
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("sin acme.json legible la copia sigue (los certificados se regeneran)", async () => {
    m.leerTraefik.mockRejectedValue(new Error("no such container"));
    await iniciarCopia("programado");
    await esperar();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resultado: "exito" }),
      }),
    );
  });

  it("si falla un paso: error con el motivo, aviso y carpeta borrada", async () => {
    m.pgDump.mockRejectedValue(
      new Error("pg_dump terminó con código 1:\nconnection refused"),
    );
    await iniciarCopia("programado");
    await esperar();
    expect(m.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: {
        resultado: "error",
        error: "pg_dump terminó con código 1:\nconnection refused",
        finalizadoEn: expect.any(Date),
      },
    });
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "copia",
      origen: "programado",
      error: expect.stringContaining("connection refused"),
    });
    expect(m.fs.rm).toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("rechaza una segunda copia mientras hay otra en curso sin crear otra fila", async () => {
    m.crearSnapshot.mockReturnValue(new Promise(() => {}));
    await iniciarCopia("manual");
    await expect(iniciarCopia("manual")).rejects.toBeInstanceOf(
      OperacionEnCurso,
    );
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("sin configuración no toma la operación ni crea fila", async () => {
    m.cargar.mockRejectedValue(
      new Error("Backups sin configurar: no hay destino"),
    );
    await expect(iniciarCopia("manual")).rejects.toThrow("no hay destino");
    expect(m.create).not.toHaveBeenCalled();
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("al superar el límite se cancela con un motivo claro", async () => {
    vi.useFakeTimers();
    m.crearSnapshot.mockImplementation(
      (r: { signal: AbortSignal }) =>
        new Promise((_, rej) =>
          r.signal.addEventListener("abort", () => rej(new Error("aborted"))),
        ),
    );
    await iniciarCopia("manual");
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    vi.useRealTimers();
    await esperar();
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultado: "error",
          error: "Cancelado: superó 60 minutos",
        }),
      }),
    );
  });
});
```

- [ ] **Step 8: Implementar `src/lib/backups/copia.ts`**

```ts
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { leerFicheroTraefik } from "@/lib/docker/traefik";
import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { LIMITE_MS, soltarOperacion, tomarOperacion } from "./operacion";
import { pgDump } from "./postgres";
import type { ConfigResuelta } from "./repositorio";
import { aplicarRetencion, crearSnapshot } from "./restic";

const log = logger.child({ module: "backups" });
const MOTIVO_LIMITE = "Cancelado: superó 60 minutos";

function mensaje(err: unknown, signal: AbortSignal): string {
  if (signal.aborted && signal.reason === MOTIVO_LIMITE) return MOTIVO_LIMITE;
  return err instanceof Error ? err.message : String(err);
}

// Runs one backup into an existing Backup row. Used directly by the restore,
// which already holds the operation lock.
export async function hacerCopia(
  backupId: string,
  config: ConfigResuelta,
  signal: AbortSignal,
): Promise<void> {
  const carpeta = await mkdtemp(path.join(tmpdir(), "vicalba-backup-"));
  const dir = (...p: string[]) => path.posix.join(carpeta, ...p);
  try {
    await pgDump(env.DATABASE_URL, dir("panel-db.dump"), signal);
    await mkdir(dir("traefik"), { recursive: true });
    await cp(env.TRAEFIK_DYNAMIC_DIR, dir("traefik", "dynamic"), {
      recursive: true,
    });
    try {
      const acme = await leerFicheroTraefik(env.ACME_JSON_PATH);
      await writeFile(dir("traefik", "acme.json"), acme, { mode: 0o600 });
    } catch (err) {
      log.warn(
        { err },
        "Copia sin acme.json: no se pudo leer del contenedor Traefik",
      );
    }
    const resumen = await conRestic(config, signal, async (r) => {
      const res = await crearSnapshot(r, carpeta);
      await aplicarRetencion(r);
      return res;
    });
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        resultado: "exito",
        snapshotId: resumen.snapshotId,
        bytesAnadidos: BigInt(resumen.bytesAnadidos),
        finalizadoEn: new Date(),
      },
    });
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
}

export async function iniciarCopia(
  origen: "programado" | "manual",
): Promise<{ id: string }> {
  const config = await cargarConfigResuelta();
  const controller = tomarOperacion();
  const backup = await prisma.backup
    .create({ data: { operacion: "copia", origen } })
    .catch((err: unknown) => {
      soltarOperacion();
      throw err;
    });

  const limite = setTimeout(() => controller.abort(MOTIVO_LIMITE), LIMITE_MS);
  void hacerCopia(backup.id, config, controller.signal)
    .catch(async (err: unknown) => {
      const error = mensaje(err, controller.signal);
      log.error({ err, backupId: backup.id }, "Copia de seguridad fallida");
      await prisma.backup.update({
        where: { id: backup.id },
        data: { resultado: "error", error, finalizadoEn: new Date() },
      });
      await notificarFalloBackup({ operacion: "copia", origen, error });
    })
    .catch((err: unknown) =>
      log.error({ err }, "No se pudo registrar el fallo de la copia"),
    )
    .finally(() => {
      clearTimeout(limite);
      soltarOperacion();
    });
  return { id: backup.id };
}
```

NOTE: en el test del fallo de `pgDump`, el `m.fs.rm` se llama dentro de `hacerCopia` (finally) antes de que el `catch` actualice la fila; `esperar()` basta porque todo lo mockeado resuelve en microtareas.

- [ ] **Step 9: Verde y cobertura**

Run: `npx vitest run src/lib/backups --coverage --coverage.include='src/lib/backups/**'`
Expected: verde; `configuracion.ts`, `operacion.ts`, `copia.ts` al 100 %. Si alguna rama del `.catch` de registro queda sin cubrir, añade un test donde `m.update` rechace en el caso de fallo y comprueba que no se lanza ningún error no capturado y que la operación se suelta.

- [ ] **Step 10: Commit**

```bash
git add src/lib/backups/configuracion.ts src/lib/backups/configuracion.test.ts src/lib/backups/operacion.ts src/lib/backups/operacion.test.ts src/lib/backups/copia.ts src/lib/backups/copia.test.ts
git commit -m "feat(backups): copia de la BD del panel y de la config de Traefik"
```

---

### Task 7: Programación diaria y arranque

**Files:**

- Create: `src/lib/backups/programacion.ts` (+test), `src/lib/backups/programador.ts` (+test)
- Modify: `src/instrumentation.ts`

**Interfaces:**

- Consumes: `iniciarCopia` (t.6), `hayOperacionEnCurso`, `limpiarBackupsHuerfanos` (t.6).
- Produces:

  ```ts
  export const ZONA = "Europe/Madrid";
  export function inicioDelDia(ahora: Date, hora: number): Date; // hoy a hora:00 en Madrid
  export function tocaCopia(
    ahora: Date,
    hora: number,
    ultimoIntento: Date | null,
  ): boolean;
  export function proximaCopia(
    ahora: Date,
    hora: number,
    ultimoIntento: Date | null,
  ): Date;
  export async function comprobarProgramacion(ahora?: Date): Promise<boolean>; // true si lanzó copia
  export function iniciarProgramador(): void;
  ```

- [ ] **Step 1: Tests de `programacion.ts` (rojo)**

```ts
import { describe, expect, it } from "vitest";
import { inicioDelDia, proximaCopia, tocaCopia } from "./programacion";

// 14/10/2026 Madrid = UTC+2 (CEST); 14/01/2027 = UTC+1 (CET).
const h = (iso: string) => new Date(iso);

describe("inicioDelDia", () => {
  it("las 03:00 de Madrid en verano son la 01:00 UTC", () => {
    expect(inicioDelDia(h("2026-10-14T12:00:00Z"), 3)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
  it("y en invierno, las 02:00 UTC", () => {
    expect(inicioDelDia(h("2027-01-14T12:00:00Z"), 3)).toEqual(
      h("2027-01-14T02:00:00Z"),
    );
  });
  it("usa el día de Madrid aunque en UTC aún sea el anterior", () => {
    // 23:30 UTC del 13 = 01:30 del 14 en Madrid
    expect(inicioDelDia(h("2026-10-13T23:30:00Z"), 3)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
});

describe("tocaCopia", () => {
  it("no toca antes de la hora", () => {
    expect(tocaCopia(h("2026-10-14T00:59:00Z"), 3, null)).toBe(false);
  });
  it("toca a la hora si hoy no se ha intentado", () => {
    expect(
      tocaCopia(h("2026-10-14T01:00:00Z"), 3, h("2026-10-13T01:00:05Z")),
    ).toBe(true);
  });
  it("Panel parado a las 3: toca al arrancar a las 10", () => {
    expect(
      tocaCopia(h("2026-10-14T08:00:00Z"), 3, h("2026-10-13T01:00:05Z")),
    ).toBe(true);
  });
  it("un reinicio tras la copia de hoy (correcta o fallida) no la repite", () => {
    expect(
      tocaCopia(h("2026-10-14T09:00:00Z"), 3, h("2026-10-14T01:00:05Z")),
    ).toBe(false);
  });
  it("sin ningún intento previo y pasada la hora, toca", () => {
    expect(tocaCopia(h("2026-10-14T09:00:00Z"), 3, null)).toBe(true);
  });
});

describe("proximaCopia", () => {
  it("hoy a la hora si aún no ha llegado", () => {
    expect(proximaCopia(h("2026-10-14T00:30:00Z"), 3, null)).toEqual(
      h("2026-10-14T01:00:00Z"),
    );
  });
  it("ahora si toca y no se ha hecho", () => {
    const ahora = h("2026-10-14T09:00:00Z");
    expect(proximaCopia(ahora, 3, h("2026-10-13T01:00:00Z"))).toEqual(ahora);
  });
  it("mañana a la hora si hoy ya se intentó", () => {
    expect(
      proximaCopia(h("2026-10-14T09:00:00Z"), 3, h("2026-10-14T01:00:05Z")),
    ).toEqual(h("2026-10-15T01:00:00Z"));
  });
  it("mañana respeta el cambio de hora (25/10/2026 pasa a CET)", () => {
    expect(
      proximaCopia(h("2026-10-24T09:00:00Z"), 3, h("2026-10-24T01:00:05Z")),
    ).toEqual(h("2026-10-25T02:00:00Z"));
  });
});
```

- [ ] **Step 2: Ver fallar**, luego **implementar `src/lib/backups/programacion.ts`**

```ts
export const ZONA = "Europe/Madrid";

function partesMadrid(fecha: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(fecha)
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
  return p;
}

// Madrid wall-clock time `hora:00` of the given Madrid calendar day, in UTC.
function aLasEnMadrid(
  anio: number,
  mes: number,
  dia: number,
  hora: number,
): Date {
  const supuesta = Date.UTC(anio, mes - 1, dia, hora);
  const p = partesMadrid(new Date(supuesta));
  const desfase =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - supuesta;
  return new Date(supuesta - desfase);
}

export function inicioDelDia(ahora: Date, hora: number): Date {
  const p = partesMadrid(ahora);
  return aLasEnMadrid(p.year, p.month, p.day, hora);
}

export function tocaCopia(
  ahora: Date,
  hora: number,
  ultimoIntento: Date | null,
): boolean {
  const inicio = inicioDelDia(ahora, hora);
  return ahora >= inicio && (!ultimoIntento || ultimoIntento < inicio);
}

export function proximaCopia(
  ahora: Date,
  hora: number,
  ultimoIntento: Date | null,
): Date {
  if (tocaCopia(ahora, hora, ultimoIntento)) return ahora;
  const inicio = inicioDelDia(ahora, hora);
  if (ahora < inicio) return inicio;
  const p = partesMadrid(ahora);
  const manana = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return aLasEnMadrid(
    manana.getUTCFullYear(),
    manana.getUTCMonth() + 1,
    manana.getUTCDate(),
    hora,
  );
}
```

Run: `npx vitest run src/lib/backups/programacion.test.ts` → verde.

- [ ] **Step 3: Tests de `programador.ts` (rojo)**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findConfig: vi.fn(),
  findBackup: vi.fn(),
  iniciarCopia: vi.fn(),
  hay: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionBackup: { findUnique: m.findConfig },
    backup: { findFirst: m.findBackup },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("./copia", () => ({ iniciarCopia: m.iniciarCopia }));
vi.mock("./operacion", () => ({ hayOperacionEnCurso: m.hay }));

import { comprobarProgramacion, iniciarProgramador } from "./programador";

const listo = {
  habilitado: true,
  hora: 3,
  claveConfirmadaEn: new Date(),
  repositorioInicializadoEn: new Date(),
};
const ahora = new Date("2026-10-14T09:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  m.hay.mockReturnValue(false);
  m.findConfig.mockResolvedValue(listo);
  m.findBackup.mockResolvedValue(null);
  m.iniciarCopia.mockResolvedValue({ id: "b1" });
});

describe("comprobarProgramacion", () => {
  it("lanza la copia programada cuando toca", async () => {
    expect(await comprobarProgramacion(ahora)).toBe(true);
    expect(m.findBackup).toHaveBeenCalledWith({
      where: { operacion: "copia", origen: "programado" },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    expect(m.iniciarCopia).toHaveBeenCalledWith("programado");
  });

  it.each([
    ["deshabilitado", { ...listo, habilitado: false }],
    ["clave sin confirmar", { ...listo, claveConfirmadaEn: null }],
    [
      "repositorio sin inicializar",
      { ...listo, repositorioInicializadoEn: null },
    ],
    ["sin configuración", null],
  ])("no hace nada si está %s", async (_, config) => {
    m.findConfig.mockResolvedValue(config);
    expect(await comprobarProgramacion(ahora)).toBe(false);
    expect(m.iniciarCopia).not.toHaveBeenCalled();
  });

  it("no hace nada con otra operación en curso", async () => {
    m.hay.mockReturnValue(true);
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });

  it("no repite si hoy ya se intentó", async () => {
    m.findBackup.mockResolvedValue({
      iniciadoEn: new Date("2026-10-14T01:00:05Z"),
    });
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });

  it("un error al lanzar no rompe el programador", async () => {
    m.iniciarCopia.mockRejectedValue(
      new Error("Backups sin configurar: no hay destino"),
    );
    expect(await comprobarProgramacion(ahora)).toBe(false);
  });
});

describe("iniciarProgramador", () => {
  it("comprueba cada minuto y no se arranca dos veces", () => {
    vi.useFakeTimers();
    const espia = vi.spyOn(globalThis, "setInterval");
    iniciarProgramador();
    iniciarProgramador();
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith(expect.any(Function), 60_000);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 4: Implementar `src/lib/backups/programador.ts`**

```ts
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { iniciarCopia } from "./copia";
import { hayOperacionEnCurso } from "./operacion";
import { tocaCopia } from "./programacion";

const log = logger.child({ module: "backups" });
const global = globalThis as unknown as { programadorBackups?: NodeJS.Timeout };

export async function comprobarProgramacion(
  ahora = new Date(),
): Promise<boolean> {
  try {
    if (hayOperacionEnCurso()) return false;
    const config = await prisma.configuracionBackup.findUnique({
      where: { id: "default" },
    });
    if (
      !config?.habilitado ||
      !config.claveConfirmadaEn ||
      !config.repositorioInicializadoEn
    ) {
      return false;
    }
    const ultimo = await prisma.backup.findFirst({
      where: { operacion: "copia", origen: "programado" },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    if (!tocaCopia(ahora, config.hora, ultimo?.iniciadoEn ?? null))
      return false;
    await iniciarCopia("programado");
    return true;
  } catch (err) {
    log.error({ err }, "No se pudo lanzar la copia programada");
    return false;
  }
}

// The state lives in the database, so a restart neither skips nor repeats a day.
export function iniciarProgramador(): void {
  if (global.programadorBackups) return;
  global.programadorBackups = setInterval(
    () => void comprobarProgramacion(),
    60_000,
  );
}
```

Run: `npx vitest run src/lib/backups/programador.test.ts` → verde.

- [ ] **Step 5: Arranque en `src/instrumentation.ts`.** Tras el bloque de `limpiarDeploysHuerfanos`, dentro de `register()`:

```ts
const { limpiarBackupsHuerfanos } = await import("@/lib/backups/operacion");
const { iniciarProgramador } = await import("@/lib/backups/programador");
try {
  const huerfanos = await limpiarBackupsHuerfanos(
    "Interrumpido por reinicio del panel",
  );
  if (huerfanos > 0)
    log.warn({ huerfanos }, "Copias de seguridad interrumpidas cerradas");
} catch (err) {
  log.error({ err }, "No se pudieron cerrar las copias interrumpidas");
}
iniciarProgramador();
```

`src/instrumentation.ts` está fuera de la cobertura (`src/**` de infraestructura); se verifica en la tarea 14.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backups/programacion.ts src/lib/backups/programacion.test.ts src/lib/backups/programador.ts src/lib/backups/programador.test.ts src/instrumentation.ts
git commit -m "feat(backups): copia diaria programada y cierre de huérfanas al arrancar"
```

---

### Task 8: Restauración

**Files:**

- Create: `src/lib/backups/restaurar.ts`, `src/lib/backups/restaurar.test.ts`

**Interfaces:**

- Consumes: `cargarConfigResuelta`, `conRestic` (t.6); `tomarOperacion`, `soltarOperacion`, `LIMITE_MS` (t.6); `hacerCopia` (t.6); `restaurarSnapshot` (t.3); `pgRestore` (t.4); `ejecutar` (t.3); `notificarFalloBackup` (t.5).
- Produces:

  ```ts
  export async function buscarFichero(
    dir: string,
    nombre: string,
  ): Promise<string | null>;
  export async function iniciarRestauracion(
    snapshotId: string,
  ): Promise<{ id: string }>;
  ```

- [ ] **Step 1: Tests (rojo).** `buscarFichero` se prueba con carpetas reales en `os.tmpdir()`; la orquestación con mocks (mismo patrón de `vi.hoisted` que la tarea 6):

```ts
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cargar: vi.fn(),
  hacerCopia: vi.fn(),
  restaurarSnapshot: vi.fn(),
  pgRestore: vi.fn(),
  ejecutar: vi.fn(),
  backupCreate: vi.fn(),
  backupUpdate: vi.fn(),
  backupFindMany: vi.fn(),
  backupDeleteMany: vi.fn(),
  backupCreateMany: vi.fn(),
  configFind: vi.fn(),
  configUpsert: vi.fn(),
  credFind: vi.fn(),
  credUpsert: vi.fn(),
  transaction: vi.fn(),
  disconnect: vi.fn(),
  notificar: vi.fn(),
  reemplazarDinamica: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://u:p@db/bd",
    TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic",
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) },
}));
vi.mock("@/lib/notificaciones", () => ({ notificarFalloBackup: m.notificar }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    backup: {
      create: m.backupCreate,
      update: m.backupUpdate,
      findMany: m.backupFindMany,
      deleteMany: m.backupDeleteMany,
      createMany: m.backupCreateMany,
    },
    configuracionBackup: { findUnique: m.configFind, upsert: m.configUpsert },
    credencial: { findUnique: m.credFind, upsert: m.credUpsert },
    $transaction: m.transaction,
    $disconnect: m.disconnect,
  },
}));
vi.mock("./configuracion", () => ({
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, signal: AbortSignal, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [], signal }),
}));
vi.mock("./copia", () => ({ hacerCopia: m.hacerCopia }));
vi.mock("./restic", () => ({ restaurarSnapshot: m.restaurarSnapshot }));
vi.mock("./postgres", () => ({ pgRestore: m.pgRestore }));
vi.mock("./procesos", () => ({ ejecutar: m.ejecutar }));

import {
  buscarFichero,
  iniciarRestauracion,
  reemplazarConfigTraefik,
} from "./restaurar";
import {
  OperacionEnCurso,
  hayOperacionEnCurso,
  soltarOperacion,
  tomarOperacion,
} from "./operacion";

const esperar = () => new Promise((r) => setTimeout(r, 0));
let tmp: string;

describe("buscarFichero", () => {
  afterAll(() => rm(tmp, { recursive: true, force: true }));
  it("encuentra el fichero a cualquier profundidad o devuelve null", async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "buscar-"));
    await mkdir(path.join(tmp, "tmp", "vicalba-backup-x"), { recursive: true });
    await writeFile(
      path.join(tmp, "tmp", "vicalba-backup-x", "panel-db.dump"),
      "x",
    );
    expect(await buscarFichero(tmp, "panel-db.dump")).toBe(
      path.join(tmp, "tmp", "vicalba-backup-x", "panel-db.dump"),
    );
    expect(await buscarFichero(tmp, "no-existe")).toBeNull();
  });
});

describe("iniciarRestauracion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    soltarOperacion();
    m.cargar.mockResolvedValue({ clave: "c", destino: { tipo: "sftp" } });
    m.backupCreate
      .mockResolvedValueOnce({ id: "previa" })
      .mockResolvedValueOnce({ id: "rest" });
    m.configFind.mockResolvedValue({
      id: "default",
      sftpCredencialId: "cred1",
      hora: 3,
    });
    m.credFind.mockResolvedValue({ id: "cred1", nombre: "backups" });
    m.backupFindMany.mockResolvedValue([{ id: "previa" }]);
    m.transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("copia previa, restaura la BD, conserva lo de backups, migra, restaura Traefik y marca éxito", async () => {
    // restaurarSnapshot crea los ficheros donde buscarFichero los encontrará: lo
    // simulamos con una implementación que escribe en la carpeta destino.
    m.restaurarSnapshot.mockImplementation(
      async (_r: unknown, _id: string, destino: string) => {
        await mkdir(path.join(destino, "x", "traefik", "dynamic"), {
          recursive: true,
        });
        await writeFile(path.join(destino, "x", "panel-db.dump"), "dump");
      },
    );
    expect(await iniciarRestauracion("abc123")).toEqual({ id: "rest" });
    await esperar();
    await esperar();

    expect(m.backupCreate).toHaveBeenNthCalledWith(1, {
      data: { operacion: "copia", origen: "antes_de_restaurar" },
    });
    expect(m.hacerCopia).toHaveBeenCalledWith(
      "previa",
      expect.anything(),
      expect.any(AbortSignal),
    );
    expect(m.backupCreate).toHaveBeenNthCalledWith(2, {
      data: {
        operacion: "restauracion",
        origen: "manual",
        snapshotId: "abc123",
      },
    });
    expect(m.pgRestore).toHaveBeenCalledWith(
      "postgresql://u:p@db/bd",
      expect.stringContaining("panel-db.dump"),
      expect.any(AbortSignal),
    );
    expect(m.credUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cred1" } }),
    );
    expect(m.configUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "default" } }),
    );
    expect(m.backupDeleteMany).toHaveBeenCalled();
    expect(m.backupCreateMany).toHaveBeenCalledWith({
      data: [{ id: "previa" }],
    });
    expect(m.ejecutar).toHaveBeenCalledWith(
      "npx",
      ["prisma", "migrate", "deploy"],
      expect.anything(),
    );
    expect(m.disconnect).toHaveBeenCalled();
    expect(m.backupUpdate).toHaveBeenLastCalledWith({
      where: { id: "rest" },
      data: { resultado: "exito", finalizadoEn: expect.any(Date) },
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si la copia previa falla no toca la BD", async () => {
    m.hacerCopia.mockRejectedValue(new Error("destino caído"));
    await iniciarRestauracion("abc123");
    await esperar();
    await esperar();
    expect(m.pgRestore).not.toHaveBeenCalled();
    expect(m.notificar).toHaveBeenCalledWith({
      operacion: "restauracion",
      origen: "manual",
      error: expect.stringContaining("copia previa"),
    });
    expect(hayOperacionEnCurso()).toBe(false);
  });

  it("si el snapshot no contiene el dump, falla sin tocar la BD", async () => {
    m.restaurarSnapshot.mockResolvedValue(undefined);
    await iniciarRestauracion("abc123");
    await esperar();
    await esperar();
    expect(m.pgRestore).not.toHaveBeenCalled();
    expect(m.backupUpdate).toHaveBeenLastCalledWith({
      where: { id: "rest" },
      data: {
        resultado: "error",
        error: "La copia no contiene panel-db.dump",
        finalizadoEn: expect.any(Date),
      },
    });
  });

  it("rechaza si hay otra operación en curso", async () => {
    tomarOperacion();
    await expect(iniciarRestauracion("abc123")).rejects.toBeInstanceOf(
      OperacionEnCurso,
    );
    expect(m.backupCreate).not.toHaveBeenCalled();
  });
});
```

Añade también un test de `reemplazarConfigTraefik(origen, destino)` con carpetas reales: tras llamarla, el destino contiene exactamente los ficheros del origen (los que solo existían en el destino desaparecen).

- [ ] **Step 2: Ver fallar** — `npx vitest run src/lib/backups/restaurar.test.ts`.

- [ ] **Step 3: Implementar `src/lib/backups/restaurar.ts`**

```ts
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { hacerCopia } from "./copia";
import { LIMITE_MS, soltarOperacion, tomarOperacion } from "./operacion";
import { pgRestore } from "./postgres";
import { ejecutar } from "./procesos";
import { restaurarSnapshot } from "./restic";

const log = logger.child({ module: "backups" });

// restic restores files under the absolute path they were backed up from, which
// is a temp dir of the run that made the copy: search instead of assuming it.
export async function buscarFichero(
  dir: string,
  nombre: string,
): Promise<string | null> {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isFile() && entrada.name === nombre) return ruta;
    if (entrada.isDirectory()) {
      const encontrado = await buscarFichero(ruta, nombre);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

export async function reemplazarConfigTraefik(
  origen: string,
  destino: string,
): Promise<void> {
  for (const f of await readdir(destino))
    await rm(path.join(destino, f), { recursive: true, force: true });
  await cp(origen, destino, { recursive: true });
}

async function restaurarBd(dump: string, signal: AbortSignal): Promise<void> {
  // The backup settings and history must not travel back in time: an old
  // destination or key would cut the panel off from the newer copies.
  const config = await prisma.configuracionBackup.findUnique({
    where: { id: "default" },
  });
  const credencial = config?.sftpCredencialId
    ? await prisma.credencial.findUnique({
        where: { id: config.sftpCredencialId },
      })
    : null;
  const historial = await prisma.backup.findMany();

  await pgRestore(env.DATABASE_URL, dump, signal);

  const ops = [];
  if (credencial) {
    const { id, ...resto } = credencial;
    ops.push(
      prisma.credencial.upsert({
        where: { id },
        create: credencial,
        update: resto,
      }),
    );
  }
  if (config) {
    const { id, ...resto } = config;
    ops.push(
      prisma.configuracionBackup.upsert({
        where: { id },
        create: config,
        update: resto,
      }),
    );
  }
  ops.push(
    prisma.backup.deleteMany(),
    prisma.backup.createMany({ data: historial }),
  );
  await prisma.$transaction(ops);
}

export async function iniciarRestauracion(
  snapshotId: string,
): Promise<{ id: string }> {
  const config = await cargarConfigResuelta();
  const controller = tomarOperacion();
  const { signal } = controller;
  const limite = setTimeout(
    () => controller.abort("Cancelado: superó 60 minutos"),
    LIMITE_MS,
  );
  let restauracionId = "";

  const fallo = async (error: string) => {
    log.error({ error, snapshotId }, "Restauración fallida");
    if (restauracionId) {
      await prisma.backup.update({
        where: { id: restauracionId },
        data: { resultado: "error", error, finalizadoEn: new Date() },
      });
    }
    await notificarFalloBackup({
      operacion: "restauracion",
      origen: "manual",
      error,
    });
  };

  try {
    const previa = await prisma.backup.create({
      data: { operacion: "copia", origen: "antes_de_restaurar" },
    });
    const restauracion = await prisma.backup.create({
      data: { operacion: "restauracion", origen: "manual", snapshotId },
    });
    restauracionId = restauracion.id;

    void (async () => {
      const carpeta = await mkdtemp(path.join(tmpdir(), "vicalba-restaurar-"));
      try {
        try {
          await hacerCopia(previa.id, config, signal);
        } catch (err) {
          const motivo = err instanceof Error ? err.message : String(err);
          await prisma.backup.update({
            where: { id: previa.id },
            data: {
              resultado: "error",
              error: motivo,
              finalizadoEn: new Date(),
            },
          });
          throw new Error(`No se restauró: falló la copia previa (${motivo})`);
        }
        await conRestic(config, signal, (r) =>
          restaurarSnapshot(r, snapshotId, carpeta),
        );
        const dump = await buscarFichero(carpeta, "panel-db.dump");
        if (!dump) throw new Error("La copia no contiene panel-db.dump");

        await restaurarBd(dump, signal);
        await ejecutar("npx", ["prisma", "migrate", "deploy"], {
          env: { DATABASE_URL: env.DATABASE_URL },
          signal,
        });

        const dinamica = path.join(path.dirname(dump), "traefik", "dynamic");
        await reemplazarConfigTraefik(dinamica, env.TRAEFIK_DYNAMIC_DIR).catch(
          (err: unknown) =>
            log.warn({ err }, "Restauración sin config de Traefik"),
        );
        // Prepared statements cached by the pool point at the dropped tables.
        await prisma.$disconnect();
        await prisma.backup.update({
          where: { id: restauracionId },
          data: { resultado: "exito", finalizadoEn: new Date() },
        });
      } catch (err) {
        await fallo(err instanceof Error ? err.message : String(err));
      } finally {
        await rm(carpeta, { recursive: true, force: true });
        clearTimeout(limite);
        soltarOperacion();
      }
    })().catch((err: unknown) =>
      log.error({ err }, "No se pudo registrar el fallo de la restauración"),
    );

    return { id: restauracionId };
  } catch (err) {
    clearTimeout(limite);
    soltarOperacion();
    throw err;
  }
}
```

NOTE: `prisma.backup.update` de la restauración se ejecuta **después** de `restaurarBd`, que vuelve a insertar las filas guardadas en memoria; la fila `rest` existía al guardar el historial, así que sigue existiendo.

- [ ] **Step 4: Verde y 100 %** — `npx vitest run src/lib/backups --coverage --coverage.include='src/lib/backups/**'`. Si la rama `restaurarBd` sin credencial o sin config queda sin cubrir, añade un caso con `configFind` → `null` y comprueba que solo se ejecutan `deleteMany` y `createMany`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backups/restaurar.ts src/lib/backups/restaurar.test.ts
git commit -m "feat(backups): restaurar la BD del panel con copia previa"
```

---

### Task 9: Router tRPC `backups`

**Files:**

- Create: `src/server/routers/backups.ts`, `src/server/routers/backups.test.ts`
- Modify: `src/server/routers/_app.ts`, `vitest.config.ts` (umbrales)

**Interfaces:**

- Consumes: `cifrar`/`descifrar`; `generarClave`, `kitRecuperacion` (t.2); `urlRepositorio` (t.2); `abrirOInicializar`, `listarSnapshots` (t.3); `conRestic`, `cargarConfigResuelta`, `BackupsNoConfigurados` (t.6); `iniciarCopia` (t.6); `OperacionEnCurso`, `hayOperacionEnCurso` (t.6); `iniciarRestauracion` (t.8); `proximaCopia` (t.7).
- Produces (usado por la UI, tarea 11):

  ```ts
  backups.obtenerConfiguracion(): {
    habilitado: boolean; hora: number; tipoDestino: "s3" | "sftp" | null;
    s3: { endpoint: string|null; bucket: string|null; region: string|null; prefijo: string|null; accessKeyId: string|null; tieneSecretKey: boolean };
    sftp: { host: string|null; puerto: number; usuario: string|null; ruta: string|null; credencialId: string|null };
    tieneClave: boolean; claveConfirmada: boolean; repositorioInicializado: boolean;
    proximaCopia: Date | null; enCurso: boolean;
  }
  backups.guardarDestino(input: DestinoInput): { repositorio: "existente" | "inicializado" }
  backups.obtenerKit(): { kit: string }
  backups.confirmarClave(): void
  backups.guardarProgramacion({ habilitado: boolean; hora: number }): void
  backups.lanzarCopia(): { id: string }
  backups.historial(): Array<{ id; operacion; origen; resultado; iniciadoEn: Date; finalizadoEn: Date|null; snapshotId: string|null; bytesAnadidos: number|null; error: string|null }>
  backups.copias(): Array<{ id: string; fecha: Date; bytes: number|null }>
  backups.restaurar({ snapshotId: string; confirmacion: "RESTAURAR" }): { id: string }
  backups.resumen(): { habilitado: boolean; ultimaCorrecta: Date | null; ultimoResultado: "en_curso"|"exito"|"error"|null }
  ```

  `DestinoInput` = `{ tipo: "s3"; endpoint; bucket; region?; prefijo?; accessKeyId; secretKey?; clave? } | { tipo: "sftp"; host; puerto; usuario; ruta; credencialId; clave? }`.

- [ ] **Step 1: Tests (rojo).** `src/server/routers/backups.test.ts` copia la cabecera de mocks de `configuracion.test.ts` (env, auth, módulos docker/traefik/ssl que `_app.ts` necesita) y añade:

```ts
const m = vi.hoisted(() => ({
  configFind: vi.fn(),
  configUpsert: vi.fn(),
  configUpdate: vi.fn(),
  credFind: vi.fn(),
  backupFindMany: vi.fn(),
  backupFindFirst: vi.fn(),
  abrir: vi.fn(),
  listar: vi.fn(),
  iniciarCopia: vi.fn(),
  iniciarRestauracion: vi.fn(),
  hay: vi.fn(),
  cargar: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionBackup: {
      findUnique: m.configFind,
      upsert: m.configUpsert,
      update: m.configUpdate,
    },
    credencial: { findUnique: m.credFind },
    backup: { findMany: m.backupFindMany, findFirst: m.backupFindFirst },
  },
}));
vi.mock("@/lib/crypto", () => ({
  cifrar: (v: string) => ({
    valorCifrado: `cif(${v})`,
    iv: "iv",
    authTag: "tag",
  }),
  descifrar: (v: string) => v.replace(/^cif\((.*)\)$/, "$1"),
}));
vi.mock("@/lib/backups/kit", async (o) => ({
  ...(await o<typeof import("@/lib/backups/kit")>()),
  generarClave: () => "CLAVE-NUEVA",
}));
vi.mock("@/lib/backups/restic", () => ({
  abrirOInicializar: m.abrir,
  listarSnapshots: m.listar,
}));
vi.mock("@/lib/backups/configuracion", async (o) => ({
  ...(await o<typeof import("@/lib/backups/configuracion")>()),
  cargarConfigResuelta: m.cargar,
  conRestic: (_c: unknown, _s: unknown, fn: (r: unknown) => unknown) =>
    fn({ env: {}, args: [] }),
}));
vi.mock("@/lib/backups/copia", () => ({ iniciarCopia: m.iniciarCopia }));
vi.mock("@/lib/backups/restaurar", () => ({
  iniciarRestauracion: m.iniciarRestauracion,
}));
vi.mock("@/lib/backups/operacion", async (o) => ({
  ...(await o<typeof import("@/lib/backups/operacion")>()),
  hayOperacionEnCurso: m.hay,
}));
```

Casos mínimos (uno por comportamiento; añade los que falten hasta el 100 %):

```ts
const s3Input = {
  tipo: "s3" as const,
  endpoint: "https://s3.ejemplo.com",
  bucket: "mi-bucket",
  accessKeyId: "AK",
  secretKey: "SK",
};

describe("backups.guardarDestino", () => {
  it("genera la clave, inicializa el repositorio y guarda todo cifrado", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockResolvedValue("inicializado");
    const res = await caller().backups.guardarDestino(s3Input);
    expect(res).toEqual({ repositorio: "inicializado" });
    const datos = m.configUpsert.mock.calls[0]![0].create;
    expect(datos).toMatchObject({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.ejemplo.com",
      s3Bucket: "mi-bucket",
      s3SecretKeyCifrada: "cif(SK)",
      claveCifrada: "cif(CLAVE-NUEVA)",
      repositorioInicializadoEn: expect.any(Date),
      claveConfirmadaEn: null,
    });
  });

  it("con clave de un repositorio existente la da por confirmada", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockResolvedValue("existente");
    await caller().backups.guardarDestino({
      ...s3Input,
      clave: "CLAVE-DEL-KIT",
    });
    expect(m.configUpsert.mock.calls[0]![0].create).toMatchObject({
      claveCifrada: "cif(CLAVE-DEL-KIT)",
      claveConfirmadaEn: expect.any(Date),
    });
  });

  it("si la clave no abre el repositorio no guarda nada", async () => {
    m.configFind.mockResolvedValue(null);
    m.abrir.mockRejectedValue(
      new Error("La clave no abre el repositorio existente"),
    );
    await expect(
      caller().backups.guardarDestino(s3Input),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "La clave no abre el repositorio existente",
    });
    expect(m.configUpsert).not.toHaveBeenCalled();
  });

  it("secret key vacía mantiene la guardada", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      s3SecretKeyCifrada: "cif(VIEJA)",
      s3SecretKeyIv: "iv",
      s3SecretKeyTag: "tag",
    });
    m.abrir.mockResolvedValue("existente");
    await caller().backups.guardarDestino({ ...s3Input, secretKey: "" });
    expect(m.configUpsert.mock.calls[0]![0].update).toMatchObject({
      s3SecretKeyCifrada: "cif(VIEJA)",
    });
  });

  it("no permite cambiar una clave ya guardada", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
    });
    await expect(
      caller().backups.guardarDestino({ ...s3Input, clave: "OTRA" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it.each([
    ["endpoint sin https", { ...s3Input, endpoint: "http://s3.ejemplo.com" }],
    ["prefijo con ..", { ...s3Input, prefijo: "../otro" }],
    [
      "ruta SFTP relativa",
      {
        tipo: "sftp",
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "relativa",
        credencialId: "c1",
      },
    ],
    [
      "puerto fuera de rango",
      {
        tipo: "sftp",
        host: "h",
        puerto: 70000,
        usuario: "u",
        ruta: "/r",
        credencialId: "c1",
      },
    ],
  ])("valida la entrada: %s", async (_, input) => {
    await expect(
      caller().backups.guardarDestino(input as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("SFTP con credencial inexistente: NOT_FOUND", async () => {
    m.configFind.mockResolvedValue(null);
    m.credFind.mockResolvedValue(null);
    await expect(
      caller().backups.guardarDestino({
        tipo: "sftp",
        host: "h",
        puerto: 22,
        usuario: "u",
        ruta: "/r",
        credencialId: "c1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("kit y clave", () => {
  it("obtenerKit devuelve el kit mientras no está confirmada", async () => {
    m.configFind.mockResolvedValue({
      tipoDestino: "s3",
      s3Endpoint: "https://s3.x",
      s3Bucket: "b",
      s3Prefijo: null,
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: null,
    });
    const { kit } = await caller().backups.obtenerKit();
    expect(kit).toContain("Clave:        K");
    expect(kit).toContain("s3:https://s3.x/b");
  });
  it("después de confirmar: FORBIDDEN", async () => {
    m.configFind.mockResolvedValue({
      claveCifrada: "cif(K)",
      claveIv: "iv",
      claveTag: "tag",
      claveConfirmadaEn: new Date(),
    });
    await expect(caller().backups.obtenerKit()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("sin clave: NOT_FOUND", async () => {
    m.configFind.mockResolvedValue(null);
    await expect(caller().backups.obtenerKit()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("programación y operaciones", () => {
  it("habilitar exige repositorio inicializado y clave confirmada", async () => {
    m.configFind.mockResolvedValue({
      repositorioInicializadoEn: new Date(),
      claveConfirmadaEn: null,
    });
    await expect(
      caller().backups.guardarProgramacion({ habilitado: true, hora: 3 }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("hora fuera de 0-23: BAD_REQUEST", async () => {
    await expect(
      caller().backups.guardarProgramacion({ habilitado: false, hora: 24 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("lanzarCopia con otra en curso: CONFLICT", async () => {
    m.iniciarCopia.mockRejectedValue(new OperacionEnCurso());
    await expect(caller().backups.lanzarCopia()).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
  it("lanzarCopia sin configurar: PRECONDITION_FAILED", async () => {
    m.iniciarCopia.mockRejectedValue(
      new BackupsNoConfigurados("no hay destino"),
    );
    await expect(caller().backups.lanzarCopia()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("restaurar exige escribir RESTAURAR y un id hexadecimal", async () => {
    await expect(
      caller().backups.restaurar({
        snapshotId: "abc123",
        confirmacion: "restaurar" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().backups.restaurar({
        snapshotId: "abc; rm",
        confirmacion: "RESTAURAR",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    m.iniciarRestauracion.mockResolvedValue({ id: "r1" });
    expect(
      await caller().backups.restaurar({
        snapshotId: "abc12345",
        confirmacion: "RESTAURAR",
      }),
    ).toEqual({ id: "r1" });
  });
  it("historial convierte bytesAnadidos de BigInt a number", async () => {
    m.backupFindMany.mockResolvedValue([
      { id: "b1", bytesAnadidos: BigInt(4096) },
    ]);
    expect((await caller().backups.historial())[0]!.bytesAnadidos).toBe(4096);
    expect(m.backupFindMany).toHaveBeenCalledWith({
      orderBy: { iniciadoEn: "desc" },
      take: 30,
    });
  });
});
```

(`caller()` = `createCallerFactory(appRouter)(await createContext())` con `auth` mockeado a una sesión, como en `configuracion.test.ts`; defínelo como función async al principio del fichero y usa `await caller()` si tu helper es async.)

- [ ] **Step 2: Ver fallar** — `npx vitest run src/server/routers/backups.test.ts`.

- [ ] **Step 3: Implementar `src/server/routers/backups.ts`**

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BackupsNoConfigurados,
  conRestic,
  cargarConfigResuelta,
} from "@/lib/backups/configuracion";
import { iniciarCopia } from "@/lib/backups/copia";
import { generarClave, kitRecuperacion } from "@/lib/backups/kit";
import { OperacionEnCurso, hayOperacionEnCurso } from "@/lib/backups/operacion";
import { proximaCopia } from "@/lib/backups/programacion";
import {
  urlRepositorio,
  type DestinoResuelto,
} from "@/lib/backups/repositorio";
import { abrirOInicializar, listarSnapshots } from "@/lib/backups/restic";
import { iniciarRestauracion } from "@/lib/backups/restaurar";
import { cifrar, descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const sinPuntos = (s: string) => !s.split("/").includes("..");
const claveInput = z.string().min(16).optional();

const destinoInput = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("s3"),
    endpoint: z.string().url().startsWith("https://"),
    bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    region: z.string().max(64).optional(),
    prefijo: z.string().max(200).refine(sinPuntos).optional(),
    accessKeyId: z.string().min(1).max(200),
    secretKey: z.string().max(400).optional(),
    clave: claveInput,
  }),
  z.object({
    tipo: z.literal("sftp"),
    host: z.string().regex(/^[A-Za-z0-9.-]+$/),
    puerto: z.number().int().min(1).max(65535),
    usuario: z.string().regex(/^[A-Za-z0-9._-]+$/),
    ruta: z.string().startsWith("/").refine(sinPuntos),
    credencialId: z.string().min(1),
    clave: claveInput,
  }),
]);

const ID = "default";

async function leerConfig() {
  return prisma.configuracionBackup.findUnique({ where: { id: ID } });
}

function errorTrpc(err: unknown): never {
  if (err instanceof OperacionEnCurso)
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof BackupsNoConfigurados)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
  throw err;
}

export const backupsRouter = router({
  obtenerConfiguracion: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const ultimo = await prisma.backup.findFirst({
      where: { operacion: "copia", origen: "programado" },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    const hora = c?.hora ?? 3;
    return {
      habilitado: c?.habilitado ?? false,
      hora,
      tipoDestino: c?.tipoDestino ?? null,
      s3: {
        endpoint: c?.s3Endpoint ?? null,
        bucket: c?.s3Bucket ?? null,
        region: c?.s3Region ?? null,
        prefijo: c?.s3Prefijo ?? null,
        accessKeyId: c?.s3AccessKeyId ?? null,
        tieneSecretKey: Boolean(c?.s3SecretKeyCifrada),
      },
      sftp: {
        host: c?.sftpHost ?? null,
        puerto: c?.sftpPuerto ?? 22,
        usuario: c?.sftpUsuario ?? null,
        ruta: c?.sftpRuta ?? null,
        credencialId: c?.sftpCredencialId ?? null,
      },
      tieneClave: Boolean(c?.claveCifrada),
      claveConfirmada: Boolean(c?.claveConfirmadaEn),
      repositorioInicializado: Boolean(c?.repositorioInicializadoEn),
      proximaCopia: c?.habilitado
        ? proximaCopia(new Date(), hora, ultimo?.iniciadoEn ?? null)
        : null,
      enCurso: hayOperacionEnCurso(),
    };
  }),

  guardarDestino: protectedProcedure
    .input(destinoInput)
    .mutation(async ({ input }) => {
      const actual = await leerConfig();
      const claveGuardada =
        actual?.claveCifrada && actual.claveIv && actual.claveTag
          ? descifrar(actual.claveCifrada, actual.claveIv, actual.claveTag)
          : null;
      if (claveGuardada && input.clave) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La clave de cifrado no se puede cambiar",
        });
      }
      const clave = claveGuardada ?? input.clave ?? generarClave();

      let destino: DestinoResuelto;
      if (input.tipo === "s3") {
        const secretKey =
          input.secretKey ||
          (actual?.s3SecretKeyCifrada &&
          actual.s3SecretKeyIv &&
          actual.s3SecretKeyTag
            ? descifrar(
                actual.s3SecretKeyCifrada,
                actual.s3SecretKeyIv,
                actual.s3SecretKeyTag,
              )
            : "");
        if (!secretKey)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Falta la secret key",
          });
        destino = {
          tipo: "s3",
          endpoint: input.endpoint,
          bucket: input.bucket,
          region: input.region || null,
          prefijo: input.prefijo || null,
          accessKeyId: input.accessKeyId,
          secretKey,
        };
      } else {
        const cred = await prisma.credencial.findUnique({
          where: { id: input.credencialId },
        });
        if (!cred)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credencial SSH no encontrada",
          });
        destino = {
          tipo: "sftp",
          host: input.host,
          puerto: input.puerto,
          usuario: input.usuario,
          ruta: input.ruta,
          clavePrivada: descifrar(
            cred.clavePrivadaCifrada,
            cred.iv,
            cred.authTag,
          ),
        };
      }

      let repositorio: "existente" | "inicializado";
      try {
        repositorio = await conRestic(
          { destino, clave },
          undefined,
          abrirOInicializar,
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : String(err),
        });
      }

      const claveCif = cifrar(clave);
      const secret = destino.tipo === "s3" ? cifrar(destino.secretKey) : null;
      const datos = {
        tipoDestino: input.tipo,
        s3Endpoint: input.tipo === "s3" ? input.endpoint : null,
        s3Bucket: input.tipo === "s3" ? input.bucket : null,
        s3Region: input.tipo === "s3" ? input.region || null : null,
        s3Prefijo: input.tipo === "s3" ? input.prefijo || null : null,
        s3AccessKeyId: input.tipo === "s3" ? input.accessKeyId : null,
        s3SecretKeyCifrada: secret?.valorCifrado ?? null,
        s3SecretKeyIv: secret?.iv ?? null,
        s3SecretKeyTag: secret?.authTag ?? null,
        sftpHost: input.tipo === "sftp" ? input.host : null,
        sftpPuerto: input.tipo === "sftp" ? input.puerto : 22,
        sftpUsuario: input.tipo === "sftp" ? input.usuario : null,
        sftpRuta: input.tipo === "sftp" ? input.ruta : null,
        sftpCredencialId: input.tipo === "sftp" ? input.credencialId : null,
        claveCifrada: claveCif.valorCifrado,
        claveIv: claveCif.iv,
        claveTag: claveCif.authTag,
        repositorioInicializadoEn: new Date(),
        // A key typed in by the user comes from their kit: it is already saved.
        claveConfirmadaEn:
          actual?.claveConfirmadaEn ?? (input.clave ? new Date() : null),
      };
      await prisma.configuracionBackup.upsert({
        where: { id: ID },
        create: { id: ID, ...datos },
        update: datos,
      });
      return { repositorio };
    }),

  obtenerKit: protectedProcedure.query(async () => {
    const c = await leerConfig();
    if (!c?.claveCifrada || !c.claveIv || !c.claveTag) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Aún no hay clave de cifrado",
      });
    }
    if (c.claveConfirmadaEn) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "El kit solo se muestra hasta confirmar que está guardado",
      });
    }
    const clave = descifrar(c.claveCifrada, c.claveIv, c.claveTag);
    const repositorio =
      c.tipoDestino === "s3"
        ? urlRepositorio({
            tipo: "s3",
            endpoint: c.s3Endpoint ?? "",
            bucket: c.s3Bucket ?? "",
            prefijo: c.s3Prefijo,
            region: null,
            accessKeyId: "",
            secretKey: "",
          })
        : urlRepositorio({
            tipo: "sftp",
            host: c.sftpHost ?? "",
            puerto: c.sftpPuerto,
            usuario: c.sftpUsuario ?? "",
            ruta: c.sftpRuta ?? "",
            clavePrivada: "",
          });
    return { kit: kitRecuperacion(repositorio, clave) };
  }),

  confirmarClave: protectedProcedure.mutation(async () => {
    await prisma.configuracionBackup.update({
      where: { id: ID },
      data: { claveConfirmadaEn: new Date() },
    });
  }),

  guardarProgramacion: protectedProcedure
    .input(
      z.object({
        habilitado: z.boolean(),
        hora: z.number().int().min(0).max(23),
      }),
    )
    .mutation(async ({ input }) => {
      const c = await leerConfig();
      if (
        input.habilitado &&
        (!c?.repositorioInicializadoEn || !c.claveConfirmadaEn)
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Configura el destino y confirma que has guardado el kit antes de activar los backups",
        });
      }
      await prisma.configuracionBackup.upsert({
        where: { id: ID },
        create: { id: ID, ...input },
        update: input,
      });
    }),

  lanzarCopia: protectedProcedure.mutation(async () => {
    try {
      return await iniciarCopia("manual");
    } catch (err) {
      errorTrpc(err);
    }
  }),

  historial: protectedProcedure.query(async () => {
    const filas = await prisma.backup.findMany({
      orderBy: { iniciadoEn: "desc" },
      take: 30,
    });
    return filas.map((f) => ({
      ...f,
      bytesAnadidos: f.bytesAnadidos === null ? null : Number(f.bytesAnadidos),
    }));
  }),

  copias: protectedProcedure.query(async () => {
    try {
      const config = await cargarConfigResuelta();
      return await conRestic(config, undefined, listarSnapshots);
    } catch (err) {
      errorTrpc(err);
    }
  }),

  restaurar: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
        confirmacion: z.literal("RESTAURAR"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await iniciarRestauracion(input.snapshotId);
      } catch (err) {
        errorTrpc(err);
      }
    }),

  resumen: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const [ultimaCorrecta, ultima] = await Promise.all([
      prisma.backup.findFirst({
        where: { operacion: "copia", resultado: "exito" },
        orderBy: { iniciadoEn: "desc" },
        select: { iniciadoEn: true },
      }),
      prisma.backup.findFirst({
        where: { operacion: "copia" },
        orderBy: { iniciadoEn: "desc" },
        select: { resultado: true },
      }),
    ]);
    return {
      habilitado: c?.habilitado ?? false,
      ultimaCorrecta: ultimaCorrecta?.iniciadoEn ?? null,
      ultimoResultado: ultima?.resultado ?? null,
    };
  }),
});
```

Registra el router en `src/server/routers/_app.ts`: `import { backupsRouter } from "./backups";` y `backups: backupsRouter,` (orden alfabético, primero de la lista).

NOTE: los mocks de `findFirst` del test deben cubrir las dos llamadas de `resumen` (`mockResolvedValueOnce` dos veces) y la de `obtenerConfiguracion`; añade tests de `obtenerConfiguracion` (sin fila → valores por defecto y `proximaCopia: null`; habilitado → `proximaCopia` es una fecha) y de `resumen` hasta el 100 %.

- [ ] **Step 4: Umbrales en `vitest.config.ts`.** Dentro de `thresholds`, junto a las rutas de `src/lib/*` existentes:

```ts
        "src/lib/backups/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
```

(`src/server/routers/**` ya está al 100 %.)

- [ ] **Step 5: Verde con umbrales**

Run: `npm run test:unit -- --coverage`
Expected: todo verde y sin «ERROR: Coverage for … does not meet threshold».

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/backups.ts src/server/routers/backups.test.ts src/server/routers/_app.ts vitest.config.ts
git commit -m "feat(backups): API para configurar, lanzar, listar y restaurar copias"
```

---

### Task 10: restic y cliente de PostgreSQL en la imagen

**Files:**

- Modify: `Dockerfile` (stage runner, línea `RUN apk add --no-cache libc6-compat git openssh-client docker-cli docker-cli-compose && \`)

- [ ] **Step 1: Añadir los paquetes** a esa misma línea `apk add`:

```dockerfile
RUN apk add --no-cache libc6-compat git openssh-client docker-cli docker-cli-compose restic postgresql16-client && \
```

- [ ] **Step 2: Construir y comprobar las versiones**

```bash
docker build -t vicalba-panel:backups .
docker run --rm --entrypoint sh vicalba-panel:backups -c "restic version && pg_dump --version && pg_restore --version"
```

Expected: `restic 0.18.x`, `pg_dump (PostgreSQL) 16.x`, `pg_restore (PostgreSQL) 16.x`.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore(docker): restic y cliente de PostgreSQL 16 en la imagen del panel"
```

---

### Task 11: Sección «Backups» en Configuración

**Files:**

- Modify: `src/app/(panel)/actions.ts` (acciones nuevas)
- Create: `src/components/backups/ConfiguracionBackups.tsx` (+test), `DestinoBackupForm.tsx` (+test), `KitRecuperacionModal.tsx` (+test), `HistorialBackups.tsx` (+test), `CopiasBackup.tsx` (+test)
- Modify: `src/app/(panel)/configuracion/page.tsx`

**Interfaces:**

- Consumes: el router `backups` (t.9) a través de `createServerCaller()` y `parseTRPCError` de `actions.ts`.
- Produces (server actions, todas devuelven `{ error: string }` si fallan):

  ```ts
  guardarDestinoBackupAction(input: DestinoInput): Promise<{ repositorio: "existente" | "inicializado" } | { error: string }>
  obtenerKitBackupAction(): Promise<{ kit: string } | { error: string }>
  confirmarClaveBackupAction(): Promise<void | { error: string }>
  guardarProgramacionBackupAction(habilitado: boolean, hora: number): Promise<void | { error: string }>
  lanzarCopiaBackupAction(): Promise<{ id: string } | { error: string }>
  restaurarBackupAction(snapshotId: string, confirmacion: string): Promise<{ id: string } | { error: string }>
  ```

  Exporta el tipo `DestinoInput` desde `src/server/routers/backups.ts` como `export type DestinoInput = z.infer<typeof destinoInput>;`.

- [ ] **Step 1: Server actions.** En `actions.ts`, siguiendo el patrón de `guardarConfiguracionDeploysAction` (try → `createServerCaller()` → procedure → catch `parseTRPCError`):

```ts
export async function guardarDestinoBackupAction(input: DestinoInput) {
  try {
    const api = await createServerCaller();
    return await api.backups.guardarDestino(input);
  } catch (err) {
    return { error: parseTRPCError(err, "No se pudo guardar el destino") };
  }
}
```

Y las otras cinco con el mismo esqueleto (`obtenerKit`, `confirmarClave`, `guardarProgramacion({ habilitado, hora })`, `lanzarCopia`, `restaurar({ snapshotId, confirmacion: confirmacion as "RESTAURAR" })`). Mensajes por defecto: «No se pudo obtener el kit», «No se pudo confirmar», «No se pudo guardar la programación», «No se pudo lanzar la copia», «No se pudo iniciar la restauración». El `as "RESTAURAR"` es seguro porque Zod lo valida en el router.

- [ ] **Step 2: Tests de componentes (rojo).** Un test por componente con Testing Library, mockeando `@/app/(panel)/actions` y `next/navigation` (`useRouter` → `{ refresh: vi.fn() }`) como en `ConfiguracionDeploys.test.tsx`. Comportamientos que deben fijarse:

`KitRecuperacionModal.test.tsx`:

```tsx
it("no deja continuar hasta marcar que el kit está guardado", async () => {
  render(
    <KitRecuperacionModal
      kit={"Clave:        K"}
      onConfirmado={onConfirmado}
    />,
  );
  const continuar = screen.getByRole("button", { name: "Continuar" });
  expect(continuar).toBeDisabled();
  await userEvent.click(
    screen.getByLabelText("He guardado el kit fuera de la VPS"),
  );
  await userEvent.click(continuar);
  expect(confirmarClaveBackupAction).toHaveBeenCalled();
  expect(onConfirmado).toHaveBeenCalled();
});
it("copia el kit al portapapeles", async () => {
  const writeText = vi.fn();
  Object.assign(navigator, { clipboard: { writeText } });
  render(<KitRecuperacionModal kit="KIT" onConfirmado={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Copiar" }));
  expect(writeText).toHaveBeenCalledWith("KIT");
});
```

`DestinoBackupForm.test.tsx`: cambiar a SFTP muestra host/puerto/usuario/ruta y el selector de credencial; «Probar y guardar» llama a `guardarDestinoBackupAction` con el objeto del tipo elegido; un `{ error }` se muestra con `role="alert"`; el campo de secret key vacío envía `secretKey: ""`; si `tieneClave` es false se muestra el campo opcional «Clave de un repositorio existente».

`CopiasBackup.test.tsx`: el botón «Restaurar» abre el aviso con la fecha; «Restaurar» del aviso está desactivado hasta escribir exactamente `RESTAURAR`; al confirmar llama a `restaurarBackupAction(id, "RESTAURAR")` y muestra un toast de éxito.

`HistorialBackups.test.tsx`: muestra fecha, «Copia/Restauración», origen («Programada», «Manual», «Antes de restaurar»), resultado y tamaño legible (4096 → «4 KB»); el error aparece en la fila fallida.

`ConfiguracionBackups.test.tsx`: estado con «Última copia» y «Próxima copia»; «Hacer copia ahora» llama a `lanzarCopiaBackupAction` y está desactivado si `enCurso`; si `tieneClave && !claveConfirmada` abre el `KitRecuperacionModal` con el kit de `obtenerKitBackupAction`; el interruptor de programación llama a `guardarProgramacionBackupAction(true, hora)`.

- [ ] **Step 3: Implementar los componentes** (`"use client"`), con los estilos de `ConfiguracionDeploys.tsx` y `ConfiguracionNotificaciones.tsx` (inputs `min-h-10 px-3 font-body text-[13px] ... border-border-strong`, botón primario `bg-[var(--color-accent)]`, `useTransition`, `useToast`). Reglas de contenido:
  - Tamaños: `formatearBytes(n)` local en `HistorialBackups.tsx` (B, KB, MB, GB con 1 decimal; 1024 por unidad).
  - Fechas: `toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })`.
  - Aviso de restauración (texto exacto): «El Panel volverá al estado del {fecha}: Proyectos, variables, usuarios, credenciales e historial de deploys. Se perderán los cambios hechos desde entonces. Los contenedores en marcha no se tocan. Antes se hará una copia automática para poder deshacerlo.»
  - Tras cualquier acción con éxito: `router.refresh()`.
  - `CopiasBackup` recibe `copias: Array<{ id: string; fecha: Date; bytes: number | null }> | { error: string }` y muestra el error (p. ej. destino inaccesible) en lugar de la lista.

- [ ] **Step 4: Página.** En `src/app/(panel)/configuracion/page.tsx`: añade `{ id: "backups", etiqueta: "Backups" }` a `SECCIONES` después de `"deploys"`; cuando `seccion === "backups"` carga en paralelo `api.backups.obtenerConfiguracion()`, `api.backups.historial()`, `api.credenciales.listar()` (ya se carga) y `api.backups.copias().catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }))`, y renderiza:

```tsx
<Encabezado
  titulo="Backups"
  descripcion="Copia diaria cifrada de la BD del Panel y de la configuración de Traefik. Se conservan 7 diarias y 4 semanales."
/>
<ConfiguracionBackups config={configBackups} credenciales={credenciales} historial={historialBackups} copias={copiasBackup} />
```

Carga los datos de backups **solo** en esa sección (las copias consultan el destino remoto).

- [ ] **Step 5: Verde y cobertura** — `npm run test:unit -- --coverage`; los cinco componentes ≥ 80 %. `npm run type-check` y `npm run lint` sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(panel)/actions.ts" "src/app/(panel)/configuracion/page.tsx" src/components/backups src/server/routers/backups.ts
git commit -m "feat(backups): sección Backups en Configuración"
```

---

### Task 12: Avisos en el Dashboard

**Files:**

- Modify: `src/components/dashboard/AtencionPanel.tsx` (+test), `src/components/dashboard/EstadoVps.tsx` (+test), `src/app/(panel)/page.tsx`
- Create: `src/lib/backups/aviso.ts` (+test)

**Interfaces:**

- Consumes: `backups.resumen()` (t.9).
- Produces:

  ```ts
  export const HORAS_SIN_COPIA = 26;
  export function avisoBackups(
    resumen: {
      habilitado: boolean;
      ultimaCorrecta: Date | null;
      ultimoResultado: string | null;
    },
    ahora: Date,
  ): string | null;
  ```

  `AtencionPanel` recibe una prop nueva `avisoBackups: string | null`; `EstadoVps` recibe `backups: { habilitado: boolean; ultimaCorrecta: Date | null }`.

- [ ] **Step 1: Test de `avisoBackups` (rojo)**

```ts
import { describe, expect, it } from "vitest";
import { avisoBackups } from "./aviso";

const ahora = new Date("2026-10-14T12:00:00Z");

describe("avisoBackups", () => {
  it("sin backups habilitados no avisa", () => {
    expect(
      avisoBackups(
        { habilitado: false, ultimaCorrecta: null, ultimoResultado: null },
        ahora,
      ),
    ).toBeNull();
  });
  it("la última copia falló", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-14T01:00:00Z"),
          ultimoResultado: "error",
        },
        ahora,
      ),
    ).toBe("La última copia de seguridad falló");
  });
  it("sin copia correcta en 26 h", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-13T09:00:00Z"),
          ultimoResultado: "exito",
        },
        ahora,
      ),
    ).toBe("Ninguna copia de seguridad correcta en las últimas 26 h");
  });
  it("nunca ha habido copia correcta", () => {
    expect(
      avisoBackups(
        { habilitado: true, ultimaCorrecta: null, ultimoResultado: null },
        ahora,
      ),
    ).toBe("Ninguna copia de seguridad correcta en las últimas 26 h");
  });
  it("todo en orden", () => {
    expect(
      avisoBackups(
        {
          habilitado: true,
          ultimaCorrecta: new Date("2026-10-14T01:00:00Z"),
          ultimoResultado: "exito",
        },
        ahora,
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar `src/lib/backups/aviso.ts`**

```ts
export const HORAS_SIN_COPIA = 26;

export function avisoBackups(
  resumen: {
    habilitado: boolean;
    ultimaCorrecta: Date | null;
    ultimoResultado: string | null;
  },
  ahora: Date,
): string | null {
  if (!resumen.habilitado) return null;
  if (resumen.ultimoResultado === "error")
    return "La última copia de seguridad falló";
  const limite = ahora.getTime() - HORAS_SIN_COPIA * 3600_000;
  if (!resumen.ultimaCorrecta || resumen.ultimaCorrecta.getTime() < limite) {
    return `Ninguna copia de seguridad correcta en las últimas ${HORAS_SIN_COPIA} h`;
  }
  return null;
}
```

- [ ] **Step 3: Componentes (TDD).** Test en `AtencionPanel.test.tsx`: con `avisoBackups="La última copia de seguridad falló"` se ve ese texto con un enlace «Ver backups» a `/configuracion?seccion=backups`, y el mensaje «Todo en orden» no aparece aunque no haya proyectos. En `EstadoVps.test.tsx`: línea «Backups» con «hace X» (usa `formatHace` de `@/lib/formatHace`) o «Desactivados». Implementa añadiendo la tarjeta de aviso antes de la lista de proyectos y la línea en `EstadoVps` con el mismo marcado que las líneas existentes.

- [ ] **Step 4: Página del Dashboard.** En `src/app/(panel)/page.tsx` añade `api.backups.resumen()` al `Promise.all` existente y pasa `avisoBackups={avisoBackups(resumenBackups, new Date())}` a `AtencionPanel` y `backups={{ habilitado: resumenBackups.habilitado, ultimaCorrecta: resumenBackups.ultimaCorrecta }}` a `EstadoVps`.

- [ ] **Step 5: Verde** — `npm run test:unit -- --coverage`, type-check y lint.

- [ ] **Step 6: Commit**

```bash
git add src/lib/backups/aviso.ts src/lib/backups/aviso.test.ts src/components/dashboard/AtencionPanel.tsx src/components/dashboard/AtencionPanel.test.tsx src/components/dashboard/EstadoVps.tsx src/components/dashboard/EstadoVps.test.tsx "src/app/(panel)/page.tsx"
git commit -m "feat(backups): avisos de backups en el Dashboard"
```

---

### Task 13: Documentación

**Files:**

- Create: `docs/recuperacion.md`
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `docs/roadmap.md`

- [ ] **Step 1: `docs/recuperacion.md`** con estas secciones y comandos exactos:

````markdown
# Recuperar el Panel en una VPS nueva

Necesitas el **kit de recuperación** (repositorio + clave de restic), las credenciales del destino
y la **`ENCRYPTION_KEY`** del `.env` original.

## 1. Preparar la VPS

Sigue «Requisitos previos en la VPS» y «Primera vez» de `CLAUDE.md` **sin** arrancar el stack:
`git clone`, `cp .env.production.example .env` y rellénalo con **la misma `ENCRYPTION_KEY`**.

## 2. Descargar la última copia

```bash
apt install restic   # o descarga el binario de https://github.com/restic/restic/releases
export RESTIC_REPOSITORY='<repositorio del kit>'
export RESTIC_PASSWORD='<clave del kit>'
# S3:
export AWS_ACCESS_KEY_ID='...' AWS_SECRET_ACCESS_KEY='...'
# SFTP: la clave SSH del destino en ~/.ssh y, si el puerto no es 22,
#   restic -o sftp.command="ssh -p 2222 usuario@host -s sftp" ...
restic snapshots --tag panel
restic restore latest --tag panel --target /tmp/recuperacion
find /tmp/recuperacion -name panel-db.dump
```

## 3. Restaurar la base de datos

```bash
docker compose up -d db
DUMP=$(find /tmp/recuperacion -name panel-db.dump)
docker compose cp "$DUMP" db:/tmp/panel-db.dump
docker compose exec db pg_restore --clean --if-exists --no-owner -U vicalba -d vicalba /tmp/panel-db.dump
```

## 4. Restaurar Traefik

```bash
DIR=$(dirname "$DUMP")/traefik
cp -r "$DIR/dynamic/." /var/vicalba/traefik/dynamic/
docker compose up -d traefik
docker compose cp "$DIR/acme.json" traefik:/letsencrypt/acme.json
docker compose exec traefik chmod 600 /letsencrypt/acme.json
docker compose restart traefik
```

## 5. Arrancar el Panel

```bash
docker compose up -d --build
```

El Panel aplica las migraciones pendientes al arrancar. Entra con tu usuario de siempre y
comprueba en Configuración → Backups que el destino aparece configurado.

## 6. Proyectos

Redespliega cada Proyecto desde su ficha: el código se clona de nuevo de GitHub.
Los volúmenes y las BDs de los Clientes llegarán con las fases B y C de los backups.

## Si una restauración desde el Panel se interrumpe

Si el Panel se reinicia justo después de restaurar la BD y antes de reescribir la configuración
de backups, esta puede quedar como estaba en la fecha restaurada: revisa el destino en
Configuración → Backups y vuelve a guardarlo si ha cambiado desde entonces.
````

- [ ] **Step 2: `CHANGELOG.md`.** Entrada nueva arriba (versión aún sin fecha definitiva; se ajusta al cerrar la 2.2.0):

```markdown
## [2.2.0] - AAAA-MM-DD

Copias de seguridad automáticas del Panel.

### Novedades

- **Backups** en Configuración: copia diaria cifrada de la base de datos del Panel y de la
  configuración de Traefik a un almacenamiento S3 compatible (Backblaze B2, Cloudflare R2,
  Hetzner, AWS…) o a un servidor SFTP. Se conservan 7 copias diarias y 4 semanales.
- **Restaurar** una copia desde el Panel, con una copia automática previa para poder deshacerlo.
- **Kit de recuperación** para reconstruir el Panel en otra VPS (ver `docs/recuperacion.md`).
- Aviso en el Dashboard y por los canales de notificación si una copia falla.

### Al actualizar

- La migración de base de datos se aplica sola al arrancar el Panel.
- Los backups vienen desactivados: actívalos en Configuración → Backups y guarda el kit de
  recuperación **y** la `ENCRYPTION_KEY` del `.env` fuera de la VPS.
```

- [ ] **Step 3: `CLAUDE.md`.** En «Observabilidad» añade: «**Backups:** `src/lib/backups/` con restic (etiqueta `panel`, host `vicalba-panel`); programador en `src/instrumentation.ts` (comprobación cada minuto, estado en BD); `/api/health` no los incluye a propósito». En «Despliegue en producción» añade «### Nota — backups» con: caché y `known_hosts` en `<REPOS_DIR>/.backups/`, recuperación en `docs/recuperacion.md`. En «Estado actual», línea de la 2.2.0 (en construcción: fase A de backups).

- [ ] **Step 4: `docs/roadmap.md`.** En «### 2.2.0» marca `[x] Backups — fase A` y añade `[ ] Backups — fase B (volúmenes)` y `[ ] Backups — fase C (BDs de Clientes)`; en «Más adelante» añade: cambiar la clave de cifrado, varios destinos, retención configurable, `restic check` periódico.

- [ ] **Step 5: Commit**

```bash
git add docs/recuperacion.md CHANGELOG.md CLAUDE.md docs/roadmap.md
git commit -m "docs(backups): recuperación sin VPS, changelog y estado"
```

---

### Task 14: Verificación real

Sin código nuevo salvo los arreglos que salgan; cada arreglo, con su test, en su propio commit `fix(backups): …`.

- [ ] **Step 1: Stack completo en local con la imagen nueva**

```bash
docker compose -f docker-compose.dev.yml down
docker network create pruebas-backup || true
docker run -d --name minio --network pruebas-backup -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio-secreto minio/minio server /data
docker run --rm --network pruebas-backup --entrypoint sh minio/mc -c "mc alias set l http://minio:9000 minio minio-secreto && mc mb l/vicalba"
```

MinIO sirve por HTTP y el Panel exige `https://`: para la prueba, pon delante un certificado autofirmado (p. ej. `minio server --certs-dir`) y exporta `RESTIC_CACERT` en el contenedor del panel, **o** prueba S3 contra un bucket real gratuito (Backblaze B2, 10 GB). Documenta en el PR cuál se usó.

Levanta el stack de producción en local (`docker compose up -d --build`, con un `.env` de pruebas y `PANEL_DOMAIN=localhost`) y conecta el contenedor `vicalba-panel` a `pruebas-backup`.

- [ ] **Step 2: Flujo S3** — Configuración → Backups → S3 → «Probar y guardar» → aparece el kit → marcar y continuar → activar a la hora actual + 1 min. Comprobar:
  - la copia programada aparece en el historial como correcta;
  - «Hacer copia ahora» dos veces seguidas: la segunda responde «Ya hay una copia o restauración en curso»;
  - la segunda copia completa sube muy poco (`bytesAnadidos` pequeño: deduplicación);
  - `restic snapshots` desde fuera (con el kit) lista las copias con la etiqueta `panel`.

- [ ] **Step 3: Restaurar** — crear un Cliente de prueba, restaurar la copia anterior a crearlo: el Cliente desaparece, en el historial hay una copia «Antes de restaurar» y la restauración correcta; restaurar esa copia previa: el Cliente vuelve.

- [ ] **Step 4: Fallos** — parar MinIO y lanzar una copia: `error` en el historial con el motivo y aviso recibido (webhook de prueba, p. ej. https://webhook.site). Reiniciar el Panel durante una copia larga: al arrancar, la fila queda «Interrumpido por reinicio del panel».

- [ ] **Step 5: Flujo SFTP** —

```bash
ssh-keygen -t ed25519 -N "" -f /tmp/backup_ed25519
docker run -d --name sftp --network pruebas-backup -e PUBLIC_KEY="$(cat /tmp/backup_ed25519.pub)" -e USER_NAME=copias lscr.io/linuxserver/openssh-server
```

Crear en el Panel una credencial SSH con esa clave privada; destino SFTP host `sftp`, puerto `2222`, usuario `copias`, ruta `/config/vicalba`. Repetir el paso 2 (copia y listado).

- [ ] **Step 6: Simulacro de recuperación** — con el kit y la `ENCRYPTION_KEY`, en un stack limpio (otra carpeta, `docker compose -p simulacro`), seguir `docs/recuperacion.md` al pie de la letra contra el destino S3. Comprobar que se entra con el usuario de siempre, que los Proyectos y sus variables (descifradas) están, y que Configuración → Backups aparece configurado. Corregir el documento con cualquier paso que no funcione tal cual.

- [ ] **Step 7: Limpieza** — `docker rm -f minio sftp`, `docker network rm pruebas-backup`, bajar el stack de pruebas.

- [ ] **Step 8: Verificación final** — `npm run test:unit -- --coverage`, `npm run type-check`, `npm run lint`, `npm run build` y PR `feature/v2.2` → `develop` con el resumen de las pruebas manuales.
