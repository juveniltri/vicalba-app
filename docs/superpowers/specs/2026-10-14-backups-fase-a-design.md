# Backups — Fase A: núcleo (v2.2.0)

Fecha: 14/10/2026 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Hoy no existe ninguna copia de seguridad: ni de la BD del Panel (proyectos, variables cifradas,
credenciales SSH, usuarios, historial) ni de nada más. La v2.2.0 añade backups en tres fases:

| Fase                   | Contenido                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A (este documento)** | Motor de copias, destino configurable (S3 compatible o SFTP), BD del Panel + config de Traefik, copia diaria con retención, avisos, historial, listado de copias, restaurar la BD del Panel y procedimiento de recuperación sin VPS |
| B                      | Volúmenes de los Proyectos (copia y restauración por volumen)                                                                                                                                                                       |
| C                      | BDs de los Clientes (detección, dump lógico, restauración)                                                                                                                                                                          |

La fase A tiene que permitir recuperarse de dos situaciones:

1. **Un error** — algo borrado, una migración mala: se restaura desde el propio Panel.
2. **Perder la VPS** — se recupera en una VPS nueva, a mano, sin el Panel, con un kit de
   recuperación que el equipo guarda fuera de la VPS.

### Decisiones tomadas

| Tema             | Decisión                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Motor            | [restic](https://restic.net) dentro de la imagen del Panel (cifrado, deduplicación, S3/SFTP, retención y recuperación estándar sin el Panel) |
| Destino          | Configurable en el Panel: S3 compatible o SFTP. Un solo destino a la vez                                                                     |
| Clave de cifrado | La genera el Panel, se muestra una sola vez y hay que confirmar que se ha guardado                                                           |
| Frecuencia       | Diaria, a una hora configurable (por defecto 03:00, Europe/Madrid)                                                                           |
| Retención        | Fija: 7 diarias + 4 semanales                                                                                                                |
| Avisos           | Solo de los fallos, por los canales de notificación existentes                                                                               |
| Restauración     | Desde el Panel, con confirmación escrita y copia previa automática                                                                           |

### Fuera de alcance (fase A)

Volúmenes y BDs de los Clientes (fases B y C), cambiar la clave de cifrado, varios destinos a la
vez, retención configurable, `restic check` periódico. Quedan anotados en `docs/roadmap.md`.

## Contenido de una copia

Cada ejecución crea **un snapshot de restic con la etiqueta `panel`** que contiene:

```
panel-db.dump          pg_dump -Fc de la BD del Panel
traefik/dynamic/       copia de TRAEFIK_DYNAMIC_DIR
traefik/acme.json      certificados, leídos con leerFicheroTraefik (docker exec en Traefik)
```

La BD y la config de Traefik van en el mismo snapshot para que una restauración las deje
coherentes entre sí. Las fases B y C añadirán snapshots con sus propias etiquetas
(p. ej. `volumen:<id>`), cada una con su retención independiente.

## Modelo de datos

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
  hora        Int            @default(3) // 0-23, Europe/Madrid
  tipoDestino DestinoBackup?

  s3Endpoint           String? // https://...
  s3Bucket             String?
  s3Region             String?
  s3Prefijo            String?
  s3AccessKeyId        String?
  s3SecretKeyCifrada   String?
  s3SecretKeyIv        String?
  s3SecretKeyTag       String?

  sftpHost         String?
  sftpPuerto       Int         @default(22)
  sftpUsuario      String?
  sftpRuta         String? // absoluta
  sftpCredencialId String?
  sftpCredencial   Credencial? @relation(fields: [sftpCredencialId], references: [id], onDelete: SetNull)

  claveCifrada               String?
  claveIv                    String?
  claveTag                   String?
  claveConfirmadaEn          DateTime?
  repositorioInicializadoEn  DateTime?
}

model Backup {
  id            String          @id @default(cuid())
  operacion     OperacionBackup @default(copia)
  origen        OrigenBackup
  resultado     ResultadoBackup @default(en_curso)
  iniciadoEn    DateTime        @default(now())
  finalizadoEn  DateTime?
  snapshotId    String? // copia: el creado; restauración: el restaurado
  bytesAnadidos BigInt?
  error         String?         @db.Text

  @@index([iniciadoEn])
}
```

- Los secretos (secret key de S3 y clave de restic) se cifran con `cifrar`/`descifrar`
  (`src/lib/crypto.ts`, AES-256-GCM con `ENCRYPTION_KEY`), igual que la contraseña SMTP.
- La clave SSH del destino SFTP reutiliza el modelo `Credencial` existente.
- Las copias que existen se leen siempre del destino (`restic snapshots --json`); `Backup` solo
  registra ejecuciones (una copia fallida no tiene snapshot).
- **Los backups solo se ejecutan** si `habilitado`, el destino está configurado,
  `repositorioInicializadoEn` y `claveConfirmadaEn` no son nulos.

## Componentes (`src/lib/backups/`)

| Fichero          | Responsabilidad                                                                                           | Interfaz                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `repositorio.ts` | Convierte `ConfiguracionBackup` (con secretos descifrados) en el repositorio y el entorno de restic. Puro | `entornoRestic(config, rutas): { repositorio, env, args }`                       |
| `restic.ts`      | Ejecuta restic con `spawn` (argumentos en array, `AbortSignal`) e interpreta su JSON                      | `init`, `backup`, `forget`, `snapshots`, `dump`; parsers puros exportados        |
| `copia.ts`       | Orquesta una copia                                                                                        | `lanzarCopia(origen): Promise<Backup>`                                           |
| `restaurar.ts`   | Orquesta una restauración                                                                                 | `restaurarCopia(snapshotId): Promise<Backup>`                                    |
| `programador.ts` | Decide y dispara la copia diaria                                                                          | `tocaCopia(ahora, hora, ultimoIntento): boolean` (pura) + `iniciarProgramador()` |
| `kit.ts`         | Genera la clave y el kit de recuperación. Puro                                                            | `generarClave(): string`, `kitRecuperacion(repositorio, clave): string`          |

### Entorno de restic (`repositorio.ts`)

- **S3**: repositorio `s3:<endpoint>/<bucket>/<prefijo>`; `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY` y, si hay región, `AWS_DEFAULT_REGION`.
- **SFTP**: repositorio `sftp:<usuario>@<host>:<ruta>` y
  `-o sftp.command="ssh -i <fichero_clave> -p <puerto> -o StrictHostKeyChecking=accept-new
-o UserKnownHostsFile=<REPOS_DIR>/.backups/known_hosts <usuario>@<host> -s sftp"`.
  La clave privada se normaliza como la deploy key (finales Unix + salto final), se escribe con
  permisos 600 en un fichero temporal y se borra al terminar. `known_hosts` persistente: la huella
  del servidor se acepta la primera vez y después se exige.
- Siempre: `RESTIC_PASSWORD` y `RESTIC_CACHE_DIR=<REPOS_DIR>/.backups/cache` (persistente, acelera
  las copias).
- Los secretos van **solo por variables de entorno**, nunca en los argumentos.

### Una copia (`copia.ts`)

1. Si ya hay una operación de backup en curso (registro en `globalThis`, como los deploys), se
   rechaza con un error claro.
2. Crea `Backup { operacion: copia, origen, resultado: en_curso }`.
3. Prepara `os.tmpdir()/vicalba-backup-<id>/`:
   - `pg_dump -Fc -f panel-db.dump`, con la conexión de `DATABASE_URL` pasada como `PGHOST`,
     `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` (la contraseña no aparece en los argumentos).
   - copia de `TRAEFIK_DYNAMIC_DIR` en `traefik/dynamic/`.
   - `acme.json` vía `leerFicheroTraefik`; si no se puede leer, la copia sigue sin él y lo anota
     en el registro (no es motivo de fallo: los certificados se regeneran).
4. `restic backup --json --tag panel --host vicalba-panel .` con la carpeta como directorio de
   trabajo (rutas limpias dentro del snapshot).
5. `restic forget --json --tag panel --group-by host,tags --keep-daily 7 --keep-weekly 4 --prune`.
6. Marca `exito` con `snapshotId` y `bytesAnadidos` (del resumen JSON de restic).
7. **Siempre** borra la carpeta temporal.

- **Límite**: 60 minutos por operación (`AbortController`); al vencer, `error` con
  «Cancelado: superó 60 minutos».
- **Fallo** en cualquier paso: `error` con el motivo (incluida la salida de error de restic o
  `pg_dump`, recortada) y aviso por los canales de notificación.
- **Huérfanos**: al arrancar, `src/instrumentation.ts` marca como `error` («Interrumpido por
  reinicio del panel») los `Backup` que quedaron `en_curso`, como `limpiarDeploysHuerfanos`.

### Programación (`programador.ts`)

- `iniciarProgramador()` se llama desde `src/instrumentation.ts` y comprueba cada minuto.
- `tocaCopia(ahora, hora, ultimoIntento)`: sea `inicio` el día de hoy a las `hora:00` en
  Europe/Madrid. Devuelve `true` si `ahora >= inicio` y no hay ningún `Backup` de origen
  `programado` con `iniciadoEn >= inicio` (correcto o fallido: un fallo no se reintenta en bucle;
  el siguiente intento es al día siguiente o un «Hacer copia ahora»).
- Como el estado está en la BD, un Panel parado a la hora programada hace la copia al arrancar, y
  un reinicio no duplica copias.
- No hace nada si los backups no están habilitados o hay otra operación en curso.

### Restauración (`restaurar.ts`)

1. Rechaza si hay otra operación en curso; si no, toma el registro.
2. Hace una copia con origen `antes_de_restaurar` bajo el mismo registro (función interna de
   `copia.ts` que no vuelve a tomarlo). Si falla, **no restaura** (sin copia previa no hay vuelta
   atrás).
3. Crea `Backup { operacion: restauracion, origen: manual, snapshotId }`.
4. `restic restore <snapshotId> --target <tmp>` (el snapshot es pequeño: dump + config de
   Traefik) y localiza `panel-db.dump` y `traefik/dynamic/` dentro de lo restaurado, sin suponer
   la ruta absoluta con la que restic los guardó.
5. Guarda en memoria las filas actuales de `ConfiguracionBackup`, `Backup` y, si el destino es
   SFTP, su `Credencial`.
6. `pg_restore --clean --if-exists --single-transaction --no-owner` del dump: si falla, la BD
   queda como estaba.
7. `prisma migrate deploy` (pone al día una copia de una versión anterior del Panel). Va antes
   del paso 8 porque las filas guardadas tienen el esquema actual.
8. Reescribe `ConfiguracionBackup` y `Backup` con lo guardado en el paso 5 (la configuración del
   destino, la clave y el historial no retroceden). Si la credencial SSH del destino SFTP no existe
   en la BD restaurada, se vuelve a crear desde la copia en memoria de esa credencial (también
   guardada en el paso 5), para no dejar los backups sin acceso al destino.
9. Sustituye el contenido de `TRAEFIK_DYNAMIC_DIR` por el de la copia. `acme.json` no se restaura.
10. `prisma.$disconnect()` para que el pool no reutilice sentencias preparadas sobre las tablas
    recreadas.
11. Marca la restauración como `exito`/`error`; si falla, aviso por los canales.

NOTE: si el proceso muere entre los pasos 6 y 8, `ConfiguracionBackup` puede quedar con la
versión de la copia. La clave no cambia en la fase A, así que solo afectaría a un destino editado
después de esa copia; se documenta en `docs/recuperacion.md`.

## Router tRPC `backups` (`src/server/routers/backups.ts`)

Todas son `protectedProcedure` con entrada validada con Zod.

| Procedure              | Tipo     | Qué hace                                                                                                                                                                                                                                                          |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `obtenerConfiguracion` | query    | Configuración sin secretos (indica si existen) + próxima copia                                                                                                                                                                                                    |
| `guardarDestino`       | mutation | Valida; si aún no hay clave, usa la que se introduzca (repositorio existente) o la genera (32 bytes aleatorios, base64url); prueba la conexión e inicializa el repositorio (`restic init`; si ya existe, comprueba que la clave lo abre). No guarda nada si falla |
| `obtenerKit`           | query    | Devuelve el kit mientras la clave **no** esté confirmada; después, `FORBIDDEN`                                                                                                                                                                                    |
| `confirmarClave`       | mutation | Marca `claveConfirmadaEn`                                                                                                                                                                                                                                         |
| `guardarProgramacion`  | mutation | `habilitado` y `hora` (0-23); habilitar exige destino inicializado y clave confirmada                                                                                                                                                                             |
| `lanzarCopia`          | mutation | Copia manual en segundo plano; `CONFLICT` si hay otra operación en curso                                                                                                                                                                                          |
| `historial`            | query    | Últimas 30 ejecuciones                                                                                                                                                                                                                                            |
| `copias`               | query    | `restic snapshots --json --tag panel`, de la más reciente a la más antigua                                                                                                                                                                                        |
| `restaurar`            | mutation | Entrada `{ snapshotId, confirmacion: "RESTAURAR" }`; lanza la restauración en segundo plano                                                                                                                                                                       |

Validación de entrada: `s3Endpoint` URL `https://`; bucket con el formato de S3; prefijo y ruta
SFTP sin `..`; ruta SFTP absoluta; host sin espacios; puerto 1-65535; `snapshotId` hexadecimal.

**Orden de alta**: destino (probado; genera la clave si no existe, porque `restic init` la
necesita) → kit mostrado → confirmar → habilitar. Si el repositorio ya existía (VPS recuperada),
la clave es la del kit: el formulario permite introducirla en lugar de generar una nueva.

## Kit de recuperación

Se muestra en un aviso modal una sola vez (mientras no se confirme), con botón «Copiar»:

```
Kit de recuperación — vicalba-app
Repositorio:  s3:https://s3.eu-central-003.backblazeb2.com/mi-bucket/vicalba
Clave:        <clave de restic>
Credenciales: las del destino (tu cuenta de S3 / usuario SFTP)
ENCRYPTION_KEY: guárdala también; está en el .env de la VPS. Sin ella, las variables,
                credenciales SSH y contraseñas restauradas no se pueden descifrar.
Procedimiento: docs/recuperacion.md
```

El Panel nunca muestra `ENCRYPTION_KEY`. El botón para continuar está desactivado hasta marcar
«He guardado el kit fuera de la VPS».

## Interfaz

**Configuración → Backups** (`?seccion=backups`, nueva entrada en la lista de secciones):

1. **Estado**: última copia («hace 6 h · correcta» / «falló: motivo»), próxima copia, botón
   «Hacer copia ahora» (desactivado con otra operación en curso).
2. **Destino**: selector S3 / SFTP y sus campos. Secretos con el patrón de la contraseña SMTP
   (vacío = se mantiene). SFTP elige una credencial SSH existente. Botón «Probar y guardar».
3. **Programación**: activar y hora.
4. **Historial**: fecha, operación, origen, resultado, tamaño, error.
5. **Copias disponibles**: fecha, tamaño, botón «Restaurar» → modal con la explicación y el campo
   para escribir `RESTAURAR`.

**Dashboard**: en «Requiere atención», aviso si los backups están habilitados y la última copia
falló o no hay ninguna correcta en las últimas 26 h. En el estado del VPS, una línea «Backups».

`/api/health` **no cambia**: un backup fallido no degrada el Panel (y un 503 haría que Traefik
dejara de enrutarlo; ver el healthcheck del contenedor).

## Notificaciones

Nuevo aviso «backup fallido» (copia o restauración) por los canales habilitados (webhook, email,
Telegram, con el formato propio de Discord/Slack). Contenido: operación, origen, fecha y motivo
del error. Solo fallos. Mismo patrón fire-and-forget (`Promise.allSettled`) y registro del último
envío por canal que los avisos de deploy.

## Imagen Docker

`apk add restic postgresql16-client` en el stage runner (disponibles en Alpine 3.24:
restic 0.18.1, postgresql16-client 16.15; el cliente coincide con PostgreSQL 16 del stack).
Directorio persistente `<REPOS_DIR>/.backups/` (caché de restic y `known_hosts`), dentro del
volumen de repos ya montado.

## Recuperación sin VPS (`docs/recuperacion.md`)

1. VPS nueva: requisitos previos, DNS, `git clone`, `.env` con **la misma `ENCRYPTION_KEY`**.
2. Instalar restic; exportar `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` y las credenciales del
   destino; `restic snapshots --tag panel`; `restic restore latest --tag panel --target /tmp/recuperacion`.
3. `docker compose up -d db`; `pg_restore --clean --if-exists --no-owner` del dump completo
   (incluida la configuración de backups).
4. Copiar `traefik/dynamic/*` a `/var/vicalba/traefik/dynamic/` y `acme.json` al volumen
   `letsencrypt`.
5. `docker compose up -d --build`; el Panel aplica las migraciones pendientes.
6. Redesplegar cada Proyecto (el código se clona de nuevo). Volúmenes y BDs de Clientes: fases B y C.

## Pruebas

- **Unitarias** (Vitest): `src/lib/backups/**` y `src/server/routers/backups.ts` al **100 %**
  (añadidos a los umbrales de `vitest.config.ts`); componentes ≥ 80 %. `spawn`, `pg_dump`, restic
  y Prisma se mockean; los parsers del JSON de restic se prueban con salidas reales capturadas.
- **CI**: el job «Prisma migrations» valida la migración; «Docker image», que la imagen con
  restic y `postgresql16-client` se construye.
- **Manuales antes del PR**, con el stack completo en Docker en local:
  - S3: contenedor MinIO. Copia, listado, segunda copia (deduplicación), retención, restauración.
  - SFTP: contenedor con servidor SSH y una credencial SSH del Panel.
  - Fallo: destino inaccesible → `error` en el historial y aviso.
  - Simulacro de recuperación siguiendo `docs/recuperacion.md` sobre un stack limpio.

## Documentación

`docs/recuperacion.md` (nuevo), `CHANGELOG.md` (2.2.0), CLAUDE.md (estado, observabilidad,
nota de backups), `docs/roadmap.md` (fase A hecha; fases B y C; lo que queda fuera de alcance).
