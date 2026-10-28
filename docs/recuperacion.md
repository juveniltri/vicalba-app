# Recuperar el Panel en una VPS nueva

Necesitas el **kit de recuperación** (repositorio + clave de restic), las credenciales del destino
y la **`ENCRYPTION_KEY`** del `.env` original.

## 1. Preparar la VPS

Sigue `production.md` § A1–A7 **sin** arrancar el stack (sin el § A8): Docker, firewall,
`mkdir` y `chown -R 1001:1001 /var/vicalba` (sin él el Panel no puede escribir en esas carpetas,
`traefik/static` incluida), `git clone`, DNS y `cp .env.production.example .env`, rellenándolo con
**la misma `ENCRYPTION_KEY`**.

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

El `traefik.yml` estático (`traefik/static/` en la copia) no hace falta copiarlo: hasta el paso 5
Traefik solo escucha en el puerto 80, y al arrancar el Panel lo escribe a partir de la BD
restaurada (Configuración → Proxy, token de Cloudflare incluido) y reinicia Traefik.

## 5. Arrancar el Panel

```bash
docker compose up -d --build
```

El Panel aplica las migraciones pendientes al arrancar. Entra con tu usuario de siempre y
comprueba en Configuración → Backups que el destino aparece configurado.

## 6. Proyectos

Redespliega cada Proyecto desde su ficha: el código se clona de nuevo de GitHub y los
contenedores nacen vacíos. Sus BDs y carpetas de datos se recuperan después con las copias de
cada Proyecto: ver «Datos de un Proyecto» más abajo.

## Datos de un Proyecto

Cada Proyecto con copias activas guarda en el mismo repositorio, aparte de la copia del Panel
(`--tag panel`), un snapshot de restic por cada parte: una por base de datos de Postgres, una con
los roles, una por cada servidor MySQL/MariaDB y una por cada carpeta de datos. Se recuperan con
las mismas variables `RESTIC_*` del § 2, con el Panel arrancado (§ 5) o sin él.

Haz esto **después de redesplegar el Proyecto** (§ 6): los contenedores tienen que existir. El
orden de la restauración a mano es el mismo que sigue el Panel:

1. Lista los contenedores del Proyecto y **para todos menos las BDs** (Postgres, MySQL/MariaDB),
   que tienen que seguir en marcha. Sin esto, una base con conexiones abiertas no se puede
   recrear (`DROP DATABASE` falla y `ON_ERROR_STOP` aborta) y las carpetas se vaciarían con la app
   escribiendo en ellas:

   ```bash
   docker ps --filter label=com.docker.compose.project=<cliente>-<proyecto> --format '{{.ID}} {{.Label "com.docker.compose.service"}} {{.Image}}'
   docker stop <contenedor> <contenedor> ...     # todos salvo las BDs
   ```

2. Restaura las **carpetas de datos y volúmenes** (apartado de abajo).
3. Restaura los **roles** y después las **bases** de Postgres, o el `todo.sql` de MySQL/MariaDB.
4. Arranca lo que parabas: `docker start <contenedor> <contenedor> ...`.

### Encontrar el Proyecto y la copia

Todos los snapshots de Proyectos llevan las etiquetas `proyecto`, `p:<id>`, `e:<hash>`,
`c:<id de la copia>` y `o:<origen>` (`programado`, `manual` o `antes_de_restaurar`), con host
`vicalba-panel`. El `<id>` es el id del Proyecto en la BD del Panel: es el que sale en su URL,
`/proyectos/<id>`. Sin el Panel, `restic snapshots --tag proyecto` lista todo (columna Tags) y los
nombres de servicio y carpeta de la columna Paths (`/bd/<servicio>/…`, `/datos/…`) permiten
reconocer cuál es cuál. Lo más cómodo es **apuntar de antemano** el id de cada Proyecto junto al
kit de recuperación: con el Panel recuperado (§ 5) lo ves en la URL de cada uno.

```bash
restic snapshots --tag p:<id>                 # todas las copias del Proyecto
restic snapshots --tag p:<id>,o:programado    # solo las diarias
```

La columna **Paths** dice qué contiene cada snapshot:

| Path                        | Contenido                                                      |
| --------------------------- | -------------------------------------------------------------- |
| `/bd/<servicio>/<base>.sql` | una base de Postgres (`pg_dump` en texto, con `DROP`/`CREATE`) |
| `/bd/<servicio>/_roles.sql` | los roles de ese Postgres (`pg_dumpall --globals-only`)        |
| `/bd/<servicio>/todo.sql`   | todas las bases de un MySQL/MariaDB                            |
| `/datos/<clave>.tar`        | una carpeta de datos, en `tar`                                 |

Los nombres van con `encodeURIComponent` (un espacio es `%20`, una `/` es `%2F`, y los dos puntos
de `datos:` son `%3A`; una base cuyo nombre empieza por `_` lleva `%5F`). Por ejemplo, la clave
`datos:./data` es `/datos/datos%3A.%2Fdata.tar`: copia siempre la ruta tal cual de la columna
Paths de `restic snapshots`. La clave de una carpeta de datos es `datos:./ruta/en/el/repo`
(bind del Proyecto), `datos:.panel/ruta` (bind de `.panel/`) o `volumen:<nombre>` (volumen de
Docker). Para filtrar por elemento, la etiqueta `e:` es el SHA-256 de la clave recortado a 12
caracteres:

```bash
printf %s 'bd:db' | sha256sum | cut -c1-12
restic snapshots --tag p:<id>,e:<hash>
```

Cada snapshot contiene un único fichero: usa el id de snapshot de la copia que quieras (para
una copia entera, los snapshots que comparten la etiqueta `c:`).

### Postgres

Primero los roles, sin las sentencias del superusuario del contenedor (`POSTGRES_USER`, por defecto
`postgres`): la imagen ya lo ha creado con la contraseña de tu `.env`, y su `ALTER ROLE … PASSWORD`
la dejaría con la antigua. `pg_dumpall` escribe el nombre entre comillas dobles si tiene
mayúsculas, guiones u otros caracteres raros (`"my-user"`, `"App"`), así que pon el nombre
**exacto** (con comillas si las lleva en `roles.sql`; `grep '^CREATE ROLE' roles.sql` lo enseña):

```bash
restic dump <snapshot de _roles> /bd/<servicio>/_roles.sql > roles.sql
USUARIO='postgres'        # o '"my-user"' con sus comillas, tal como sale en roles.sql
grep -vE "^((CREATE|ALTER) (ROLE|USER)|COMMENT ON ROLE) ${USUARIO}( |;)" roles.sql > roles-filtrado.sql
docker exec -i <contenedor> sh -c 'exec psql -U "${POSTGRES_USER:-postgres}" -d postgres' < roles-filtrado.sql
```

Pueden quedar líneas `GRANT … TO <superusuario>`: darán un error inofensivo, porque esta ejecución
no lleva `ON_ERROR_STOP` y sigue con el resto. Los errores «ya existe» también son normales.

Después, cada base (si quieres, solo algunas):

```bash
restic dump <snapshot> /bd/<servicio>/<base>.sql \
  | docker exec -i <contenedor> sh -c 'exec psql -U "${POSTGRES_USER:-postgres}" -d postgres -v ON_ERROR_STOP=1'
```

El fichero ya trae `DROP DATABASE` y `CREATE DATABASE` (la base `postgres` no: trae el `DROP` de sus
objetos). Con conexiones abiertas el `DROP` falla: por eso se paran antes los Servicios.

### MySQL y MariaDB

```bash
restic dump <snapshot> /bd/<servicio>/todo.sql \
  | docker exec -i <contenedor> sh -c 'MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-$MYSQL_ROOT_PASSWORD}" exec mariadb -uroot'
```

En imágenes antiguas el cliente se llama `mysql` en lugar de `mariadb`. La copia no incluye las
bases `mysql`, `sys`, `performance_schema` ni `information_schema`: los usuarios los recrea el
contenedor desde su entorno.

### Carpetas de datos y volúmenes

Se vuelcan en un contenedor auxiliar (`busybox:1.37.0`) que monta el origen y lo vacía antes de
extraer. El origen es el nombre del volumen de Docker (`docker volume ls`; los de Compose se
llaman `<cliente>-<proyecto>_<volumen>`) o la ruta del bind en la VPS
(`/var/vicalba/repos/<cliente>/<proyecto>/<ruta>`).

```bash
restic dump <snapshot> '/datos/<clave codificada>.tar' \
  | docker run --rm -i -v <origen>:/datos busybox:1.37.0 \
      sh -c 'find /datos -mindepth 1 -delete && tar --numeric-owner -xf - -C /datos'
```

(`--numeric-owner` conserva los uid/gid originales.) Si prefieres no vaciar la carpeta, deja
solo `tar --numeric-owner -xf - -C /datos`. Los Servicios que escriben en ella tienen que estar
parados (paso 1 del orden de arriba).

### La carpeta `./data` de `.panel/`

Los Proyectos de un Cliente con el compose editado en el Panel comparten `.panel/`, así que su
`./data` es la misma carpeta (clave `datos:.panel/data`) y **el Panel no la restaura**: vaciarla
dejaría sin datos a otros Proyectos que están escribiendo en ella. Se recupera con el comando
anterior, con origen `/var/vicalba/repos/<cliente>/.panel/data`, parando antes los contenedores de todos los Proyectos
del Cliente que la monten. Cualquiera de ellos sirve como fuente; la copia es la misma.

### Si una restauración desde el Panel falla

Si la restauración de un Proyecto falla o se cancela, el Panel deja **todos sus Servicios
parados** (los datos pueden estar a medias) y avisa. Tienes dos salidas:

- Restaurar otra vez desde la pestaña Backups del Proyecto. Antes de cada restauración se hace una
  copia «Antes de restaurar» de lo que se iba a sustituir: aparece en la lista y devuelve el
  estado anterior.
- Terminarla a mano con los comandos de arriba y arrancar el Proyecto (**Iniciar** en el Panel o
  `docker start` de sus contenedores).

Si el Panel se cae a mitad, al arrancar quita los contenedores auxiliares `vicalba-backup-*` que
queden; a mano: `docker ps -a --filter name=^vicalba-backup- -q | xargs -r docker rm -f`.

### Lo olvidado no vuelve

Las copias de un Proyecto eliminado se borran a los 30 días (o al momento, si marcaste «Borrar
también sus copias ahora»), y las de una carpeta que dejó de montarse también a los 30 días.
Lo que restic ha olvidado y purgado no se puede recuperar.

## Si una restauración desde el Panel se interrumpe

Si el Panel se reinicia justo después de restaurar la BD y antes de reescribir la configuración
de backups, esta puede quedar como estaba en la fecha restaurada: revisa el destino en
Configuración → Backups y vuelve a guardarlo si ha cambiado desde entonces.
