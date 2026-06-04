# Lenguaje Ubicuo — vicalba-app

Glosario de términos del dominio de este proyecto. Todos los ficheros, variables, rutas, mensajes de error y documentación deben usar exactamente estos nombres.

---

## Entidades principales

| Término | Definición |
|---|---|
| **Panel** | La aplicación web de gestión — el propio vicalba-app |
| **VPS** | El servidor virtual privado que aloja todos los proyectos. Hay una única VPS. |
| **Cliente** | Entidad que contrata los servicios. Tiene uno o más proyectos. Nunca accede al panel. |
| **Proyecto** | Unidad de despliegue asociada a un cliente. Corresponde a un `docker-compose.yml` y una red Docker aislada. |
| **Servicio** | Cada contenedor dentro de un proyecto (ej: `app`, `db`, `worker`). Equivale a un `service` en Docker Compose. |
| **Red de proyecto** | Red Docker bridge dedicada para un proyecto. Aísla sus servicios de los de otros clientes. |
| **Deploy** | Acción de desplegar o redesplegar un proyecto desde su repositorio GitHub. |
| **Auto-deploy** | Configuración que activa un deploy automático al recibir un webhook de GitHub en la rama configurada. |
| **Webhook** | Evento HTTP enviado por GitHub al panel cuando hay un push/merge en una rama. |
| **Rama de deploy** | La rama de GitHub que, al recibir un push, dispara el deploy (normalmente `main` o `master`). |
| **Proxy** | Traefik — el reverse proxy que enruta dominios a contenedores. |
| **Dominio** | Nombre de dominio asociado a un proyecto/servicio. Traefik lo enruta al contenedor correcto. |
| **Certificado** | Certificado SSL/TLS generado automáticamente por Let's Encrypt para cada dominio. |
| **Log** | Salida en tiempo real de un contenedor, accesible desde el panel vía SSE. |
| **Estado** | Estado actual de un servicio: `running`, `stopped`, `error`, `deploying`. |
| **Variable de entorno** | Par clave-valor asociado a un proyecto/servicio, cifrado en base de datos. |
| **Socket Docker** | `/var/run/docker.sock` — el socket Unix que permite al panel controlar el daemon Docker. |

---

## Acciones del dominio

| Acción | Definición |
|---|---|
| `deploy` | Desplegar un proyecto por primera vez o redesplegar con cambios |
| `redeploy` | Forzar un nuevo deploy de un proyecto ya existente |
| `start` | Arrancar un servicio parado |
| `stop` | Detener un servicio en ejecución |
| `restart` | Parar y arrancar un servicio |
| `stream logs` | Conectarse al stream SSE de logs de un contenedor |
| `configure domain` | Asociar un dominio a un servicio y registrarlo en Traefik |
| `issue certificate` | Solicitar/renovar certificado Let's Encrypt para un dominio |
| `trigger webhook` | GitHub envía un evento al endpoint de webhooks del panel |

---

## Relaciones entre entidades

```
Cliente
  └── tiene N Proyectos
        ├── tiene 1 Red de proyecto (Docker bridge)
        ├── tiene N Servicios (contenedores)
        │     ├── tiene 1 Estado
        │     ├── tiene N Variables de entorno
        │     └── emite Logs
        ├── tiene N Dominios
        │     └── cada Dominio tiene 1 Certificado
        └── tiene 1 configuración de Deploy
              ├── Rama de deploy
              └── Auto-deploy: true | false
```

---

## Términos que NO se usan

| Evitar | Usar en su lugar |
|---|---|
| `app` (para referirse al conjunto) | `proyecto` |
| `server` | `VPS` o `servicio` según contexto |
| `container` (en código de dominio) | `servicio` |
| `namespace` | `red de proyecto` |
| `pipeline` | `deploy` |
| `environment` | `variables de entorno` |
