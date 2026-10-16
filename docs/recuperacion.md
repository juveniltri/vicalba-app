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

Redespliega cada Proyecto desde su ficha: el código se clona de nuevo de GitHub.
Los volúmenes y las BDs de los Clientes llegarán con las fases B y C de los backups.

## Si una restauración desde el Panel se interrumpe

Si el Panel se reinicia justo después de restaurar la BD y antes de reescribir la configuración
de backups, esta puede quedar como estaba en la fecha restaurada: revisa el destino en
Configuración → Backups y vuelve a guardarlo si ha cambiado desde entonces.
