# Dominio — vicalba-app

## Qué hace este sistema

Panel de control de infraestructura para gestionar proyectos Docker en una VPS. Los usuarios (2 personas técnicas internas) despliegan, monitorizan y gestionan proyectos de clientes desde un dashboard web. El panel controla Traefik (proxy inverso), Docker (contenedores y redes) y Let's Encrypt (SSL).

## Actores

| Actor | Descripción |
|---|---|
| **Operador** | Miembro del equipo técnico — único tipo de usuario con acceso al panel |
| **Cliente** | Entidad contratante — nunca accede al panel directamente |
| **GitHub** | Sistema externo que envía webhooks al panel para trigger de deploys |
| **Docker daemon** | Proceso del SO que ejecuta los contenedores — el panel lo controla vía socket |
| **Traefik** | Proxy inverso — recibe config dinámica del panel y enruta tráfico |
| **Let's Encrypt** | CA que emite certificados SSL — orquestado por Traefik |

## Flujos principales

### 1. Deploy de un proyecto nuevo

```
Operador → Crea cliente + proyecto en el panel
  → Panel genera red Docker aislada
  → Panel clona repo GitHub del proyecto
  → Panel ejecuta docker-compose up
  → Panel registra dominio en Traefik (config dinámica)
  → Traefik solicita certificado a Let's Encrypt
  → Servicio disponible en dominio con HTTPS
```

### 2. Auto-deploy vía webhook

```
Push a rama configurada en GitHub
  → GitHub envía webhook POST al panel
  → Panel valida HMAC-SHA256 del payload
  → Si auto-deploy = true → Panel ejecuta redeploy
  → Si auto-deploy = false → Panel notifica y espera confirmación del operador
  → Logs del deploy disponibles en tiempo real vía SSE
```

### 3. Gestión de servicios

```
Operador → Selecciona proyecto en el dashboard
  → Ve estado de cada servicio (running / stopped / error)
  → Puede: start / stop / restart / ver logs en tiempo real
```

## Invariantes del dominio

- Cada proyecto pertenece a exactamente un cliente
- Cada proyecto tiene exactamente una red Docker bridge dedicada
- No puede haber dos proyectos con el mismo dominio registrado en Traefik
- El estado de un servicio solo puede ser: `running`, `stopped`, `error`, `deploying`
- Un deploy en curso bloquea otro deploy del mismo proyecto hasta completarse
- Los logs de contenedor nunca se persisten en base de datos — solo streaming en tiempo real

## Módulos del sistema

| Módulo | Responsabilidad |
|---|---|
| `auth` | Sesiones de operadores, NextAuth v5 |
| `clients` | CRUD de clientes |
| `projects` | CRUD de proyectos, configuración de deploy |
| `docker` | Comunicación con Docker daemon via dockerode |
| `traefik` | Generación de config dinámica para Traefik |
| `webhooks` | Recepción y validación de webhooks de GitHub |
| `deployments` | Orquestación del proceso de deploy |
| `logs` | Streaming SSE de logs de contenedor |
