# Lenguaje Ubicuo — vicalba-app

Glosario de términos del dominio de este proyecto. Todos los ficheros, variables, rutas, mensajes de error y documentación deben usar exactamente estos nombres.

---

## Entidades principales

| Término                   | Definición                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Panel**                 | La aplicación web de gestión — el propio vicalba-app                                                                                                                                          |
| **VPS**                   | El servidor virtual privado que aloja todos los proyectos. Hay una única VPS.                                                                                                                 |
| **Cliente**               | Entidad que contrata los servicios. Tiene uno o más proyectos. Nunca accede al panel.                                                                                                         |
| **Proyecto**              | Unidad de despliegue asociada a un cliente. Corresponde a un `docker-compose.yml` y una red Docker aislada.                                                                                   |
| **Servicio**              | Cada contenedor en ejecución dentro de un proyecto (ej: `app`, `db`, `worker`). No se almacena en BD; se descubre en tiempo real por la label `com.docker.compose.project` del daemon Docker. |
| **Red de proyecto**       | Red Docker bridge dedicada para un proyecto. Aísla sus contenedores de los de otros clientes.                                                                                                 |
| **Deploy**                | Acción de desplegar o redesplegar un proyecto desde su repositorio GitHub.                                                                                                                    |
| **Auto-deploy**           | Configuración que activa un deploy automático al recibir un webhook de GitHub en la rama configurada.                                                                                         |
| **Webhook**               | Evento HTTP enviado por GitHub al panel cuando hay un push/merge en una rama.                                                                                                                 |
| **Rama de deploy**        | La rama de GitHub que, al recibir un push, dispara el deploy (normalmente `main` o `master`).                                                                                                 |
| **Proxy**                 | Traefik — el reverse proxy que enruta dominios a contenedores.                                                                                                                                |
| **Dominio**               | Nombre de dominio asociado a un proyecto. Traefik lo enruta al contenedor correcto.                                                                                                           |
| **Certificado**           | Certificado SSL/TLS generado automáticamente por Let's Encrypt para cada dominio.                                                                                                             |
| **Log**                   | Salida en tiempo real de un contenedor, accesible desde el panel vía SSE.                                                                                                                     |
| **Estado**                | Estado actual de un proyecto: `running`, `stopped`, `error`, `deploying`.                                                                                                                     |
| **Variable de entorno**   | Par clave-valor asociado a un proyecto, cifrado en base de datos.                                                                                                                             |
| **Socket Docker**         | `/var/run/docker.sock` — el socket Unix que permite al panel controlar el daemon Docker.                                                                                                      |
| **Origen del deploy**     | Qué lanzó un deploy: `manual` (botón del panel), `webhook` (push de GitHub) o `rollback`. Se guarda en cada registro de Deploy.                                                               |
| **Fase del deploy**       | Etapa visible del deploy en el log en vivo: Repositorio → Checkout → Build y arranque → Red y proxy. Se deduce de las líneas `→ …` que emite el deploy.                                       |
| **Variable build-time**   | Variable de entorno marcada para usarse solo durante el build de la imagen, no en el contenedor en ejecución.                                                                                 |
| **`GIT_SHA_SHORT`**       | Variable build-time que el panel inyecta en cada deploy con los 7 primeros caracteres del commit desplegado.                                                                                  |
| **Canal de notificación** | Vía por la que el panel avisa del resultado de un deploy: email, Telegram o webhook. Guarda la fecha y el error de su último envío.                                                           |
| **Proyecto fijado**       | Proyecto que el usuario ancla en la barra lateral para acceso rápido. Preferencia por navegador (localStorage), no se guarda en BD.                                                           |
| **Deploy cancelado**      | Deploy detenido a mano o por superar el timeout. Su resultado es `cancelado` y el proyecto vuelve al estado real de sus contenedores.                                                         |
| **Timeout de deploy**     | Tiempo máximo que puede durar un deploy (Configuración → Deploys). Al superarlo se cancela solo y se notifica.                                                                                |
| **Deploy huérfano**       | Deploy que quedó `en_curso` porque el panel se reinició a mitad. Se cierra como cancelado al arrancar el panel.                                                                               |
| **Novedades**             | Historial de versiones del panel, leído de `CHANGELOG.md` y mostrado en la página Novedades.                                                                                                  |

---

## Acciones del dominio

| Acción              | Definición                                                        |
| ------------------- | ----------------------------------------------------------------- |
| `deploy`            | Desplegar un proyecto por primera vez o redesplegar con cambios   |
| `redeploy`          | Forzar un nuevo deploy de un proyecto ya existente                |
| `start`             | Arrancar un proyecto parado                                       |
| `stop`              | Detener un proyecto en ejecución                                  |
| `restart`           | Parar y arrancar un proyecto                                      |
| `cancel deploy`     | Detener un deploy en curso (a mano o por timeout)                 |
| `stream logs`       | Conectarse al stream SSE de logs de los contenedores del proyecto |
| `configure domain`  | Asociar un dominio a un proyecto y registrarlo en Traefik         |
| `issue certificate` | Solicitar/renovar certificado Let's Encrypt para un dominio       |
| `trigger webhook`   | GitHub envía un evento al endpoint de webhooks del panel          |

---

## Relaciones entre entidades

```
Cliente
  └── tiene N Proyectos
        ├── tiene 1 Estado (running | stopped | error | deploying)
        ├── tiene 1 Red de proyecto (Docker bridge)
        ├── tiene N Servicios en ejecución (descubiertos por label Docker, no almacenados)
        │     └── emiten Logs (SSE en tiempo real)
        ├── tiene N Variables de entorno (cifradas en BD)
        ├── tiene 0-1 Dominios
        │     └── cada Dominio tiene 1 Certificado
        ├── tiene 1 configuración de Deploy
        │     ├── repositorioUrl
        │     ├── Rama de deploy
        │     └── Auto-deploy: true | false
        └── tiene N Deploys (historial)
              ├── sha, rama, resultado (en_curso | exito | error)
              └── Origen del deploy (manual | webhook | rollback)
```

---

## Términos que NO se usan

| Evitar                             | Usar en su lugar                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `app` (para referirse al conjunto) | `proyecto`                                                                                 |
| `server`                           | `VPS`                                                                                      |
| `container` (en código de dominio) | `servicio` (cuando se habla de uno específico) o `proyecto` (cuando se habla del conjunto) |
| `namespace`                        | `red de proyecto`                                                                          |
| `pipeline`                         | `deploy`                                                                                   |
| `environment`                      | `variables de entorno`                                                                     |
