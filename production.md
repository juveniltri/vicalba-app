# Producción — instalar, actualizar y configurar el Panel en la VPS

Guía única para el Panel en una VPS: **instalarlo desde cero** (§ A), **actualizarlo** a una
versión nueva (§ B, con los pasos concretos de cada versión), **configurar Cloudflare** (§ C), el
**acceso de emergencia** (§ D) y **problemas frecuentes** (§ E). Para reconstruir el Panel desde
una copia de seguridad en otra VPS: `docs/recuperacion.md`.

Los comandos se ejecutan en la VPS como `root` salvo que se diga otra cosa. El repositorio vive
en `/opt/vicalba-app` y los datos persistentes en `/var/vicalba`.

---

## A. Instalación desde cero

### A1. Conectarse a la VPS

```bash
ssh root@<IP_DE_TU_VPS>
```

### A2. Instalar Docker y git

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
apt install -y git

# Verificar
docker --version
docker compose version
```

### A3. Firewall

En el firewall del proveedor (Hetzner Cloud Firewall u otro), reglas **Inbound**:

| Puerto | Protocolo | Para qué                                      |
| ------ | --------- | --------------------------------------------- |
| 22     | TCP       | SSH (y el acceso de emergencia al Panel, § D) |
| 80     | TCP       | HTTP → HTTPS y validación de Let's Encrypt    |
| 443    | TCP       | HTTPS                                         |

> Sin el 22 pierdes el SSH. Sin el 80 y el 443 Let's Encrypt no emite certificados. **No abras
> el 3000**: el Panel solo lo publica en `127.0.0.1` y se usa por túnel SSH.

### A4. Directorios persistentes

```bash
mkdir -p /var/vicalba/traefik/dynamic /var/vicalba/traefik/static /var/vicalba/repos /var/vicalba/backups
# El Panel corre como uid 1001 y escribe en todas
chown -R 1001:1001 /var/vicalba
```

- `traefik/dynamic`: la configuración de los dominios de cada Proyecto, que genera el Panel.
- `traefik/static`: el `traefik.yml` de Traefik y el token de Cloudflare, que también genera el
  Panel (Configuración → Proxy). Si no existe al arrancar, Docker lo crea como `root` y el Panel
  no puede escribir en él.
- `repos`: los repositorios clonados para los deploys.
- Los certificados de Let's Encrypt van en el volumen Docker `letsencrypt`, no en el host.

### A5. Clonar el repositorio

```bash
git clone git@github.com:juveniltri/vicalba-app.git /opt/vicalba-app
cd /opt/vicalba-app
git checkout master
```

> Si la VPS no tiene clave SSH con acceso al repositorio, usa HTTPS con un token:
> `https://<TOKEN>@github.com/juveniltri/vicalba-app.git`

### A6. DNS

En el gestor de DNS del dominio, crea un registro **A** para el Panel apuntando a la VPS:

```text
panel.tudominio.com   A   <IP_DE_TU_VPS>
```

Para los dominios de los Clientes, un registro por subdominio (o un comodín `*.tudominio.com`).

> **Si el DNS está en Cloudflare**: el registro del **Panel** tiene que ir en gris (**DNS only**),
> nunca con la nube naranja; su certificado se pide por TLS y detrás del proxy de Cloudflare no se
> puede renovar. Los dominios de Clientes que quieras detrás de Cloudflare se configuran en § C.

Comprueba que resuelve antes de seguir (si no, Let's Encrypt falla):

```bash
dig +short panel.tudominio.com
# Debe devolver la IP de la VPS
```

### A7. Variables de entorno

```bash
cp .env.production.example .env
nano .env
```

Genera los secretos:

```bash
openssl rand -base64 32          # NEXTAUTH_SECRET
openssl rand -hex 32             # GITHUB_WEBHOOK_SECRET
openssl rand -hex 32             # ENCRYPTION_KEY (64 caracteres hex)
getent group docker | cut -d: -f3   # DOCKER_GID
```

El `.env` final:

```env
DB_PASSWORD=<contraseña-segura>
DATABASE_URL=postgresql://vicalba:<DB_PASSWORD>@db:5432/vicalba
NEXTAUTH_SECRET=<openssl base64>
NEXTAUTH_URL=https://panel.tudominio.com
PANEL_DOMAIN=panel.tudominio.com
ACME_EMAIL=tu@email.com
GITHUB_WEBHOOK_SECRET=<openssl hex>
ENCRYPTION_KEY=<64 caracteres hex>
DOCKER_GID=<getent>
# Opcional: errores del servidor a Sentry
SENTRY_DSN=
```

> Guarda una copia de la **`ENCRYPTION_KEY`** fuera de la VPS (gestor de contraseñas): cifra las
> variables, credenciales SSH, contraseñas de los canales, el token de Cloudflare y la clave de
> los backups. Sin ella no se puede recuperar nada.

### A8. Arrancar

```bash
docker compose up -d --build
```

Orden: PostgreSQL → Panel (migraciones al arrancar) y Traefik. Al primer arranque el Panel
escribe `traefik/static/traefik.yml` y reinicia Traefik; en el log del Panel aparece «Faltaba el
traefik.yml estático: escrito con la configuración guardada». Hasta ese momento Traefik solo
escucha en el puerto 80, así que los primeros segundos el Panel puede no responder por HTTPS.

```bash
docker compose logs -f panel        # migraciones y arranque
docker logs -f traefik              # certificados: busca errores de "acme"
```

### A9. Comprobar

```bash
docker compose ps                                   # traefik, vicalba-db, vicalba-panel: Up
curl https://panel.tudominio.com/api/health         # {"status":"ok",...}
ls /var/vicalba/traefik/static                      # traefik.yml
```

Si `/api/health` no responde tras 2 minutos, ve a § E.

### A10. Crear el primer usuario

El Panel no tiene registro público. Genera el hash de la contraseña **dentro del contenedor del
Panel** (el host no tiene Node):

```bash
docker compose exec panel node -e "require('bcryptjs').hash('TU_CONTRASEÑA', 12).then(console.log)"
docker compose exec db psql -U vicalba -d vicalba
```

```sql
INSERT INTO "User" (id, email, "passwordHash", nombre)
VALUES (gen_random_uuid()::text, 'tu@email.com', '<hash>', 'Tu nombre');
\q
```

Entra en `https://panel.tudominio.com`. El resto de usuarios se crean desde **Usuarios**.

### A11. Webhook de GitHub (auto-deploy)

En cada repositorio: **Settings → Webhooks → Add webhook**.

| Campo        | Valor                                             |
| ------------ | ------------------------------------------------- |
| Payload URL  | `https://panel.tudominio.com/api/webhooks/github` |
| Content type | `application/json`                                |
| Secret       | el `GITHUB_WEBHOOK_SECRET` del `.env`             |
| Events       | `Just the push event`                             |

Configuración → Webhook de GitHub del Panel muestra estos datos para copiarlos.

### A12. Backups

En **Configuración → Backups**:

1. Destino: S3 compatible (Backblaze B2, Cloudflare R2, Hetzner…), SFTP con una credencial SSH
   del Panel, o **Local (en la VPS)** si aún no tienes un destino externo. Pulsa **Probar y
   guardar**.

   El destino local guarda el repositorio en `/var/vicalba/backups/restic` (carpeta fija, la crea
   y da permisos el § A4; el `docker-compose.yml` la monta en el Panel). Si la VPS o su disco se
   pierden, las copias se pierden con ella: monta ahí un volumen o disco aparte del proveedor
   (`/var/vicalba/backups` como punto de montaje) y pasa a S3/SFTP en cuanto puedas.
2. Guarda el **kit de recuperación** que aparece **y** la `ENCRYPTION_KEY` fuera de la VPS.
   Confirma en el Panel que los has guardado.
3. Activa la copia diaria y elige la hora (Europe/Madrid). Al día siguiente, comprueba en el
   Historial que salió bien.

### A13. Proxy

**Configuración → Proxy** viene con los valores de siempre de Traefik y no hace falta tocarla. Solo
si los dominios pasan por un proxy delante de Traefik (Cloudflare: § C) o para depurar (nivel de
log, access log). Cada vez que se aplica, Traefik se reinicia unos segundos; si no arranca con la
nueva configuración, el Panel vuelve solo a la anterior.

### A14. Probar el acceso de emergencia

Haz la prueba de § D una vez, para tenerla comprobada antes de necesitarla.

---

## B. Actualizar a una versión nueva

### B1. Procedimiento general

1. Lee en `CHANGELOG.md` el apartado **Al actualizar** de cada versión que vayas a saltar, y los
   pasos específicos de abajo (§ B3…). Si hay pasos «antes de actualizar», hazlos primero.
2. Copia de seguridad de la BD justo antes (además de los backups diarios):

   ```bash
   cd /opt/vicalba-app
   docker compose exec -T db pg_dump -U vicalba -Fc vicalba > ~/vicalba-$(date +%F).dump
   ```

3. Actualiza el código y levanta el **stack completo** (solo reconstruye lo que cambia):

   ```bash
   git fetch --tags
   git checkout master && git pull
   docker compose up -d --build
   ```

4. Comprueba: `docker compose ps`, `curl https://panel.tudominio.com/api/health` y que los
   dominios de los Proyectos abren. En el Panel, **Novedades** muestra la versión nueva.

> Haz primero la actualización en la **VPS de desarrollo** y después en producción, siguiendo
> exactamente los mismos pasos.

### B2. Volver atrás si algo sale mal

Las migraciones no se deshacen solas: hay que restaurar la copia de B1.2 con el Panel parado y
arrancar después la versión anterior (por ejemplo `v2.2.0`):

```bash
cd /opt/vicalba-app
docker compose stop panel
docker compose exec -T db pg_restore -U vicalba -d vicalba --clean --if-exists < ~/vicalba-<fecha>.dump
git checkout v2.2.0
docker compose up -d --build
```

Los Proyectos redesplegados con la versión nueva siguen funcionando; vuelve a desplegarlos si
algo de su configuración depende de la versión anterior.

### B2b. A la 2.4.0 (backups de Proyectos y «Solo desde Cloudflare»)

(Su número es B2b para no renumerar los apartados que citan otras notas y versiones.) Si la VPS
está en la **2.1.x** o anterior, haz también § B3 y § B4 (en ese orden); si está en la **2.2.x**,
solo § B3.

**Actualizar:** § B1. Las migraciones se aplican solas al arrancar el Panel; no hay variables
nuevas en el `.env`. Para el destino **Local (en la VPS)** (opcional) crea antes la carpeta
(`mkdir -p /var/vicalba/backups && chown 1001:1001 /var/vicalba/backups`) y levanta el stack
completo con `docker compose up -d` para que el Panel tenga el montaje nuevo (§ B1 ya lo hace).

**Qué esperar:**

- La **primera copia diaria** copia **todos** los Proyectos con contenedores (cada «Copia ahora»
  copia solo su Proyecto): dump de sus BDs Postgres y MySQL/MariaDB y `tar` de sus volúmenes y carpetas de
  datos. Puede tardar horas con medias grandes y ocupa tanto como esos datos, comprimidos y
  deduplicados, en el destino: comprueba antes que hay espacio. Las siguientes solo suben lo que
  cambia. Entre tanto, el Panel sigue funcionando; una operación a la vez (cancelable desde
  Configuración → Backups o desde el Proyecto).
- Se descarga la imagen `busybox:1.37.0` la primera vez que se copia una carpeta de datos.
- Cada Proyecto empieza con la copia diaria activada; desmárcala en su pestaña **Backups** donde
  no la quieras, y desmarca los elementos que se regeneran.

**Comprobaciones:**

1. Al día siguiente, Configuración → Backups → Historial: la copia del Panel y las de cada
   Proyecto en «Correcta».
2. En cada Proyecto, pestaña **Backups**: revisa qué lista como «No se copia» y por qué.
3. Recomendado: restaurar un Proyecto de pruebas desde su pestaña, y un simulacro de
   `docs/recuperacion.md` («Datos de un Proyecto») en una VPS de usar y tirar.

**«Solo desde Cloudflare»:** las rutas que ya estén detrás de Cloudflare quedan **sin** la opción
(la migración la deja desactivada, así que nada cambia solo). Para activarla en una ruta hacen
falta los rangos de Cloudflare aplicados (§ C2); los pasos y la comprobación están en § C3 y § C6.

### B3. A la 2.3.0 (Proxy y servicios)

Si la VPS está en la **2.1.x**, haz también § B4 (2.2.0) después de esta actualización: las
migraciones de las dos versiones se aplican juntas sin problema.

**Antes de actualizar:**

```bash
mkdir -p /var/vicalba/traefik/static
chown 1001:1001 /var/vicalba/traefik/static
```

**Actualizar:** § B1, con el stack completo (`docker compose up -d --build`): cambian la imagen
de Traefik (fijada a v3.7.15), su `command`, sus volúmenes y el puerto local del Panel.

**Qué esperar al arrancar:**

- Las migraciones convierten el dominio de cada Proyecto en su primer dominio de la pestaña
  **Dominios**.
- El Panel escribe `traefik/static/traefik.yml` y reinicia Traefik (unos segundos sin HTTPS).
- Los ficheros de `traefik/dynamic` se renombran a `<cliente>_<proyecto>.yml`.

**Comprobaciones:**

```bash
docker compose ps
docker compose logs panel | grep -iE "traefik|proxy"   # «Faltaba el traefik.yml estático…»
curl https://panel.tudominio.com/api/health            # {"status":"ok",...}
ls /var/vicalba/traefik/static     # traefik.yml
ls /var/vicalba/traefik/dynamic    # <cliente>_<proyecto>.yml y _proxy.yml; ningún <proyecto>.yml suelto
```

En el Panel:

1. Abre cada Proyecto con dominio → pestaña **Dominios**: su dominio aparece con «SSL activo».
2. Abre los dominios de los Clientes en el navegador.

**Redesplegar los Proyectos Dockerfile, Node.js e imagen** (botón **Deploy** de cada uno):

- dejan de publicar su puerto en la VPS: después solo responden por su dominio (si alguien
  entraba por `http://IP:puerto`, deja de funcionar, que es lo buscado);
- los de tipo imagen pasan a conectarse a la red del Cliente.

**Acceso de emergencia:** haz la prueba de § D.

**Cloudflare:** el modo Cloudflare viene desactivado. No lo actives en producción hasta haberlo
probado en la VPS de desarrollo (§ C, con «Comprobar»).

### B4. A la 2.2.0 (backups)

1. Actualizar: § B1 (la migración de backups se aplica sola).
2. Activar los backups: § A12.
3. Recomendado: un simulacro de recuperación (`docs/recuperacion.md`) en una VPS de usar y tirar.

### B5. A la 2.1.1 (espacio en disco)

Solo si la VPS sigue en una versión anterior a la 2.1.1. Limita los logs a 3 × 10 MB por
contenedor y limpia imágenes y caché tras cada deploy, pero los contenedores existentes conservan
su configuración de logs hasta que se recrean.

1. Ver qué ocupa espacio y liberarlo ya (los contenedores siguen funcionando):

   ```bash
   df -h /
   docker system df
   du -h /var/lib/docker/containers/*/*-json.log | sort -h | tail
   truncate -s 0 /var/lib/docker/containers/*/*-json.log
   docker image prune -f
   docker builder prune -f --filter until=168h
   ```

2. Actualizar con el stack completo (§ B1): Traefik, la BD y el Panel se recrean con el límite.
3. Redesplegar cada Proyecto una vez para que sus contenedores también lo tengan.
4. Opcional, para cualquier contenedor (también los no creados por el Panel):
   `/etc/docker/daemon.json` con
   `{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }` y
   `systemctl restart docker` (reinicia todos los contenedores; vuelven solos). Solo afecta a los
   contenedores creados después.
5. Todos los usuarios tendrán que volver a iniciar sesión una vez.

### B6. A la 2.1.0

- Sentry (opcional): crear el proyecto en sentry.io (Next.js) y poner `SENTRY_DSN` en el `.env`.
  Sin DSN el Panel funciona igual.
- Vigilar el primer deploy de cada Proyecto Node.js: pasan de Node 20 a Node 22 (revisar los que
  fijen `engines.node` o usen módulos nativos antiguos).

---

## C. Cloudflare (dominios detrás del proxy de Cloudflare)

Para dominios de Clientes cuyo DNS está en vuestra cuenta de Cloudflare y que queréis con la
**nube naranja** (proxy de Cloudflare: CDN, protección DDoS…). Los dominios en gris (DNS only) no
necesitan nada de esto. El Panel nunca debe ir en naranja (§ A6).

> Estado en la 2.3.0: **en pruebas**. Hazlo primero en la VPS de desarrollo con un subdominio de
> prueba y completa «Comprobar» antes de usarlo en producción.

### C1. Crear el token de la API en Cloudflare

Con el token, Let's Encrypt valida el dominio por DNS (DNS-01): funciona detrás del proxy y no
depende de cómo esté configurado Cloudflare. Sin token se usa HTTP (C5).

1. Cloudflare → icono de perfil → **My Profile** → **API Tokens** → **Create Token**.
2. Plantilla **Edit zone DNS** → **Use template**.
3. **Permissions**: `Zone · DNS · Edit` (viene en la plantilla) y añade `Zone · Zone · Read`.
4. **Zone Resources**: `Include · Specific zone ·` cada dominio que vaya a pasar por Cloudflare
   (o `All zones from an account` si van a ser todos los de la cuenta).
5. **Continue to summary** → **Create Token** y copia el token (solo se muestra una vez).

### C2. Configurar el Panel

En **Configuración → Proxy**, bloque **Cloudflare**:

1. Marca **Hay dominios detrás del proxy de Cloudflare**. Sin esto, la protección por IP de las
   rutas de Cloudflare deja fuera a todo el mundo (no llega la IP real del visitante).
2. Despliega **Rangos de Cloudflare** y pulsa **Actualizar desde cloudflare.com** (vienen
   incluidos los del 16/10/2026; actualízalos de vez en cuando).
3. Pega el token en **Token de la API de Cloudflare**.
4. **Aplicar** → **Aplicar y reiniciar**. Espera a que desaparezca «Aplicando…». Si sale
   «revertida» o «error», lee el motivo y el log de Traefik que muestra.

El token se guarda cifrado y no vuelve a mostrarse: para cambiarlo, escribe otro y aplica; para
quitarlo, marca **Quitar el token** y aplica.

### C3. Marcar la ruta en el Panel

En el Proyecto → **Dominios** → **Editar** la ruta (o **+ Nuevo dominio**) → marca **Detrás del
proxy de Cloudflare** → **Guardar**. En la tabla aparece «☁ Detrás de Cloudflare».

Haz esto **antes** de poner la nube naranja: así el certificado se pide ya por DNS.

Al marcarla aparece **Solo desde Cloudflare** (activada por defecto): la ruta responde **403** a
toda petición que no llegue desde los servidores de Cloudflare, así nadie puede saltarse la nube
naranja yendo directo a la IP de la VPS. Necesita que los rangos de Cloudflare estén aplicados
(C2); si no, el Panel no deja guardarla. Desmárcala si algún día necesitas entrar sin pasar por
Cloudflare. La tabla muestra «Solo Cloudflare» en esa ruta.

### C4. Configurar Cloudflare para ese dominio

1. **DNS**: registro `A` del subdominio → IP de la VPS, con la **nube naranja** (Proxied).
2. **SSL/TLS → Overview**: modo **Full (strict)**.
3. Opcional: **SSL/TLS → Edge Certificates → Always Use HTTPS** activado.

### C5. Sin token (HTTP-01)

Si no configuras token, las rutas «Detrás de Cloudflare» piden el certificado por HTTP a través
de Cloudflare. Mientras el certificado no exista, el modo SSL tiene que ser **Full** (no
«strict»): con «Full (strict)» Cloudflare rechaza el certificado provisional de Traefik y la
validación no llega. Cuando la pestaña Dominios muestre «SSL activo», cambia a **Full (strict)**.

### C6. Comprobar

1. Pestaña **Dominios** del Proyecto: «SSL activo» en el dominio (puede tardar 1–2 minutos).
   Si sigue «SSL pendiente»: Configuración → Proxy → **Ver las últimas líneas del log de
   Traefik** y busca errores de `acme`/`cloudflare` (token sin permisos, zona no incluida…).
2. El dominio abre por HTTPS con el candado.
   Con **Solo desde Cloudflare**, comprueba también que ir directo a la IP es rechazado:
   `curl -sk -o /dev/null -w '%{http_code}' --resolve <dominio>:443:<IP de la VPS> https://<dominio>/`
   → **403**. Para que sea efectivo, el origen no debe tener registro `AAAA` (solo `A`): una IPv6
   publicada en el DNS permitiría llegar al origen por otra vía.
3. La IP real: si la aplicación muestra o registra la IP del visitante (`X-Forwarded-For` /
   `X-Real-Ip`), debe ser la tuya, no una de Cloudflare.
4. Protección por IP: en **Protección y cabeceras** de la ruta, pon en **IPs o rangos
   permitidos** tu IP pública → entras; quita tu IP y pon otra → **403**. Vuelve a dejarla como
   estaba.
5. Si algo falla, anótalo para el hotfix 2.3.1 y desmarca **Detrás de Cloudflare** (o pon la nube
   en gris) para volver al comportamiento normal.

---

## D. Acceso de emergencia al Panel

Si Traefik no arranca (por ejemplo, tras una configuración de Proxy rota), el Panel sigue
accesible sin pasar por él, solo desde la propia VPS y por túnel SSH.

Desde tu ordenador:

```bash
ssh -L 3000:localhost:3000 root@<IP_DE_TU_VPS>
```

Con la sesión SSH abierta, entra en `http://localhost:3000` e inicia sesión. Desde ahí puedes,
por ejemplo, volver a aplicar Configuración → Proxy: el Panel reescribe el `traefik.yml` y
reinicia Traefik.

Si ni eso funciona, restaura el fichero anterior a mano:

```bash
cd /var/vicalba/traefik/static
cp traefik.yml.prev traefik.yml
docker restart traefik
```

---

## E. Problemas frecuentes

### El Panel no responde por HTTPS y `docker logs traefik` está vacío o solo muestra el puerto 80

Traefik ha arrancado sin su `traefik.yml` (si falta el fichero, Traefik no da error: arranca con
su configuración por defecto). Comprueba que existe `/var/vicalba/traefik/static/traefik.yml`:

- No existe → el Panel no ha podido escribirlo: `chown 1001:1001 /var/vicalba/traefik/static` y
  `docker compose restart panel` (lo escribe al arrancar y reinicia Traefik).
- Existe → `docker restart traefik`.

### En el log del Panel: `EACCES … /etc/traefik/static/traefik.yml`

El directorio es de `root`: `chown 1001:1001 /var/vicalba/traefik/static` y
`docker compose restart panel`.

### Let's Encrypt no emite un certificado

- El DNS resuelve a la IP de la VPS: `dig +short <dominio>`.
- Los puertos 80 y 443 están abiertos en el firewall del proveedor.
- Si el dominio va con la nube naranja de Cloudflare, la ruta tiene que estar marcada «Detrás de
  Cloudflare» (§ C3).
- Errores en `docker logs traefik` (busca `acme`).

### Un dominio responde 502

El Servicio al que apunta la ruta no está en marcha o no tiene su alias de red: el Dashboard lo
muestra en «Requiere atención». Arranca el Servicio o redespliega el Proyecto (una ruta a un
Servicio que no tenía ninguna funciona tras el siguiente deploy).

### Error de permisos al hacer deploy (`EACCES /var/vicalba/repos`)

```bash
chown -R 1001:1001 /var/vicalba/repos
```

### Error de permisos con el socket Docker (`permission denied /var/run/docker.sock`)

```bash
getent group docker | cut -d: -f3   # pon ese número en DOCKER_GID del .env
docker compose up -d panel
```

### Prisma no encuentra `DATABASE_URL` al arrancar

Comprueba que está en `.env` con este formato:

```env
DATABASE_URL=postgresql://vicalba:<DB_PASSWORD>@db:5432/vicalba
```
