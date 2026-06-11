# Deploy en producción — VPS Ubuntu

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

## 3. Crear directorios persistentes

```bash
mkdir -p /var/vicalba/traefik/dynamic /var/vicalba/repos
touch /var/vicalba/traefik/acme.json
chmod 600 /var/vicalba/traefik/acme.json
```

> `chmod 600` en `acme.json` es obligatorio — Traefik lo rechaza si tiene permisos más abiertos.

---

## 4. Clonar el repositorio

```bash
apt install -y git
git clone git@github.com:juveniltri/vicalba-app.git /opt/vicalba-app
cd /opt/vicalba-app
```

> Si el repo es privado y no tienes SSH configurada en la VPS, usa HTTPS con token:
> `https://<TOKEN>@github.com/juveniltri/vicalba-app.git`

---

## 5. Apuntar el DNS antes de arrancar

En tu registrador de dominios, crea un registro **A**:

```
panel.tudominio.com  →  A  →  <IP_DE_TU_VPS>
```

Verifica que propaga antes de continuar (si no resuelve, Let's Encrypt fallará):

```bash
dig +short panel.tudominio.com
# Debe devolver la IP de la VPS
```

---

## 6. Configurar variables de entorno

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
```

El `.env` final debe quedar así:

```env
DB_PASSWORD=<contraseña-segura>
NEXTAUTH_SECRET=<resultado-openssl-base64>
NEXTAUTH_URL=https://panel.tudominio.com
PANEL_DOMAIN=panel.tudominio.com
ACME_EMAIL=tu@email.com
GITHUB_WEBHOOK_SECRET=<resultado-openssl-hex>
ENCRYPTION_KEY=<64-hex-chars>
```

---

## 7. Arrancar

```bash
docker compose up -d --build
```

Orden de arranque automático: PostgreSQL → migraciones → Traefik → panel.

Seguir logs en tiempo real:

```bash
docker compose logs -f
```

---

## 8. Verificar que todo está en pie

```bash
# Estado de los contenedores
docker compose ps

# Health check del panel
curl https://panel.tudominio.com/api/health
# Debe devolver: {"status":"ok",...}
```

---

## 9. Crear el primer usuario admin

El panel no tiene registro público. Crear el admin directamente en la BD:

```bash
# Paso 1 — generar el hash de la contraseña (en tu máquina o en la VPS)
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

## 10. Configurar webhook de GitHub (auto-deploy)

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
