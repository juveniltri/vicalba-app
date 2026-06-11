# Deploy en producción — VPS

## 1. Conectarse a la VPS

```bash
ssh root@<IP_DE_TU_VPS>
```

---

## 2. Instalar Docker

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Verificar
docker --version
docker compose version
```

---

## 3. Abrir puertos en el firewall

Si usas Hetzner Cloud Firewall (o cualquier firewall externo), añade estas reglas **Inbound**:

| Puerto | Protocolo | Para qué                           |
| ------ | --------- | ---------------------------------- |
| 22     | TCP       | SSH                                |
| 80     | TCP       | HTTP + Let's Encrypt TLS challenge |
| 443    | TCP       | HTTPS                              |

> Sin el puerto 22 abierto perderás acceso SSH. Sin 80 y 443, Let's Encrypt no puede emitir certificados.

---

## 4. Crear directorios persistentes

```bash
mkdir -p /var/vicalba/traefik/dynamic /var/vicalba/repos

# El panel corre como UID 1001 — debe poder escribir en ambos directorios
chown -R 1001:1001 /var/vicalba/repos
chown -R 1001:1001 /var/vicalba/traefik/dynamic
```

> `acme.json` ya no se usa en el host — los certificados se almacenan en el volumen Docker `letsencrypt`.

---

## 5. Clonar el repositorio

```bash
apt install -y git
git clone git@github.com:juveniltri/vicalba-app.git /opt/vicalba-app
cd /opt/vicalba-app
```

> Si el repo es privado y no tienes SSH configurada en la VPS, usa HTTPS con token:
> `https://<TOKEN>@github.com/juveniltri/vicalba-app.git`

---

## 6. Configurar DNS antes de arrancar

Añade un registro **wildcard A** en tu registrador de dominios:

```
*.<tudominio>.com  →  A  →  <IP_DE_TU_VPS>
@.<tudominio>.com  →  A  →  <IP_DE_TU_VPS>
```

El wildcard cubre automáticamente `panel.`, y cualquier subdominio de cliente futuro sin tocar el DNS de nuevo.

Verifica que propaga antes de continuar (si no resuelve, Let's Encrypt fallará):

```bash
dig +short panel.tudominio.com
# Debe devolver la IP de la VPS
```

---

## 7. Configurar variables de entorno

```bash
cp .env.production.example .env
nano .env
```

Genera los secretos:

```bash
# NEXTAUTH_SECRET
openssl rand -base64 32

# GITHUB_WEBHOOK_SECRET
openssl rand -hex 32

# ENCRYPTION_KEY — exactamente 64 caracteres hex (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# DOCKER_GID — GID del grupo docker en el host
getent group docker | cut -d: -f3
```

El `.env` final debe quedar así:

```env
DB_PASSWORD=<contraseña-segura>
DATABASE_URL=postgresql://vicalba:<DB_PASSWORD>@db:5432/vicalba
NEXTAUTH_SECRET=<resultado-openssl-base64>
NEXTAUTH_URL=https://panel.tudominio.com
PANEL_DOMAIN=panel.tudominio.com
ACME_EMAIL=tu@email.com
GITHUB_WEBHOOK_SECRET=<resultado-openssl-hex>
ENCRYPTION_KEY=<64-hex-chars>
DOCKER_GID=<resultado-getent>
```

---

## 8. Arrancar

```bash
docker compose up -d --build
```

Orden de arranque automático: PostgreSQL → migraciones Prisma → Traefik + panel.

Seguir logs en tiempo real:

```bash
docker compose logs -f

# Solo Traefik — para verificar que Let's Encrypt emite el certificado
docker logs -f traefik
# Busca: "Certificate obtained successfully"
```

---

## 9. Verificar que todo está en pie

```bash
# Estado de los contenedores
docker compose ps

# Health check del panel
curl https://panel.tudominio.com/api/health
# Debe devolver: {"status":"ok",...}
```

---

## 10. Crear el primer usuario admin

El panel no tiene registro público. Crear el admin directamente en la BD:

```bash
# Paso 1 — generar el hash de la contraseña
# Ejecutar desde /opt/vicalba-app donde están los node_modules
node -e "const b=require('bcryptjs'); b.hash('TU_PASSWORD_AQUI', 12).then(console.log)"

# Paso 2 — abrir psql
docker compose exec db psql -U vicalba -d vicalba
```

```sql
INSERT INTO "User" (id, email, "passwordHash", nombre, "creadoEn")
VALUES (gen_random_uuid()::text, 'tu@email.com', '<hash-del-paso-1>', 'Admin', now());
\q
```

---

## 11. Configurar webhook de GitHub (auto-deploy)

En cada repo que quieras conectar: **Settings → Webhooks → Add webhook**

| Campo        | Valor                                             |
| ------------ | ------------------------------------------------- |
| Payload URL  | `https://panel.tudominio.com/api/webhooks/github` |
| Content type | `application/json`                                |
| Secret       | mismo valor que `GITHUB_WEBHOOK_SECRET` en `.env` |
| Events       | `Push`                                            |

---

## Actualizaciones futuras

```bash
cd /opt/vicalba-app
git pull
docker compose up -d --build panel
```

---

## Troubleshooting

### Let's Encrypt no emite certificado

- Verifica que el DNS resuelve a la IP correcta: `dig +short panel.tudominio.com`
- Verifica que los puertos 80 y 443 están abiertos en el firewall del proveedor
- Revisa logs: `docker logs traefik`

### Error de permisos al hacer deploy (`EACCES /var/vicalba/repos`)

```bash
chown -R 1001:1001 /var/vicalba/repos
```

### Error de permisos al acceder al socket Docker (`permission denied /var/run/docker.sock`)

```bash
# Obtener el GID real del grupo docker
getent group docker | cut -d: -f3
# Actualizar DOCKER_GID en .env y recrear el contenedor
docker compose up -d panel
```

### Prisma no encuentra DATABASE_URL al arrancar

Asegúrate de que `DATABASE_URL` está definida en `.env`. El formato correcto:

```
DATABASE_URL=postgresql://vicalba:<DB_PASSWORD>@db:5432/vicalba
```
