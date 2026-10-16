# Changelog

Cambios del Panel visibles para quien lo usa. El panel lo muestra en la página
Novedades. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/):
cada versión con su fecha, un resumen de una línea y los apartados Novedades,
Correcciones y Seguridad.

## [2.3.0] - 2026-10-16

Varios dominios por Proyecto con su protección, la configuración de Traefik editable desde el Panel y acciones sobre cada Servicio.

### Novedades

- **Pestaña Dominios** en cada Proyecto: varios dominios, cada uno con un path opcional (`/api`),
  dirigido a un Servicio concreto del compose y a su puerto, y con redirección de `www` al dominio
  (o al revés). Muestra el certificado de cada dominio, avisa si su Servicio no está en marcha y
  enseña la configuración exacta que recibe Traefik.
- **Protección por dominio**: usuario y contraseña, IPs permitidas, límite de peticiones por
  segundo, tamaño máximo de petición, cabeceras de seguridad (HSTS, iframes, nosniff,
  Referrer-Policy) o propias, compresión y quitar el path antes de pasar al Servicio. Se puede
  copiar de otro dominio del Proyecto.
- **Configuración → Proxy**: IPs de confianza, timeouts, nivel de log, access log y TLS mínimo de
  Traefik. Al aplicar, Traefik se reinicia y, si no arranca, vuelve solo a la configuración
  anterior y explica por qué. Botón para ver las últimas líneas de su log.
- **Modo Cloudflare** (en pruebas: falta comprobarlo con certificados reales): para dominios que
  pasan por el proxy de Cloudflare, sus rangos de confianza, certificado por DNS con el token de
  la API (o por HTTP sin él) y la IP real del visitante en la protección por IP y el límite de
  peticiones. Viene desactivado.
- **Iniciar, detener y reiniciar un Servicio** del compose sin tocar los demás, desde la nueva
  tarjeta «Servicios» del Resumen.
- **Acceso de emergencia** al Panel sin pasar por Traefik: `ssh -L 3000:localhost:3000` a la VPS y
  abrir `http://localhost:3000`.
- «Requiere atención» del Dashboard avisa de los dominios cuyo Servicio no está en marcha.

### Correcciones

- Los Proyectos de tipo imagen no se conectaban a la red del Cliente, así que su dominio no
  llegaba al contenedor.
- Dos Clientes con un Proyecto del mismo nombre se pisaban la configuración de Traefik.
- El email de Let's Encrypt (`ACME_EMAIL`) nunca llegaba a Traefik, así que no había avisos de
  certificados a punto de caducar.
- Dos Proyectos Dockerfile, Node.js o imagen con el mismo puerto no podían desplegarse a la vez.

### Seguridad

- Los Proyectos Dockerfile, Node.js e imagen ya no publican su puerto en la VPS: solo se llega a
  ellos por sus dominios, con HTTPS y su protección.
- Las contraseñas de la protección por dominio se guardan cifradas con bcrypt y el Panel no las
  vuelve a mostrar; el token de Cloudflare se guarda cifrado.

### Al actualizar

- **Antes** de actualizar, en la VPS:
  `mkdir -p /var/vicalba/traefik/static && chown 1001:1001 /var/vicalba/traefik/static`.
- Levanta el stack completo, no solo el Panel: `git pull && docker compose up -d --build`. Traefik
  pasa a la versión 3.7.15 y recibe su configuración del Panel (se reinicia una vez al arrancar).
- Las migraciones se aplican solas: el dominio de cada Proyecto pasa a ser su primer dominio en
  la pestaña Dominios.
- Redespliega los Proyectos Dockerfile, Node.js e imagen: dejan de responder en `IP:puerto` y los
  de tipo imagen pasan a conectarse a la red del Cliente.
- Detalle paso a paso en `production.md`, § B3.

## [2.2.0] - 2026-10-14

Copias de seguridad automáticas del Panel y guía de uso con capturas.

### Novedades

- **Backups** en Configuración: copia diaria cifrada de la base de datos del Panel y de la
  configuración de Traefik a un almacenamiento S3 compatible (Backblaze B2, Cloudflare R2,
  Hetzner, AWS…) o a un servidor SFTP. Se conservan 7 copias diarias y 4 semanales.
- **Restaurar** una copia desde el Panel, con una copia automática previa para poder deshacerlo.
- **Kit de recuperación** para reconstruir el Panel en otra VPS (ver `docs/recuperacion.md`).
- Aviso en el Dashboard y por los canales de notificación si una copia falla.
- Si cambias el destino a otro repositorio, el Panel vuelve a mostrar el kit para que guardes el nuevo.
- **Guía de uso** en el Panel (menú «Guía»): tareas paso a paso, referencia de cada pantalla y
  capturas. También se descarga en PDF.

### Correcciones

- Los filtros por nivel de los logs (ERR, WARN, INFO, DEBUG) no filtraban: las líneas en JSON se
  mostraban en bruto. Ahora se ven con su hora y su mensaje y se filtran por nivel.
- En una instalación nueva, antes de emitirse el primer certificado, el Dashboard decía
  «Certificados: no se pueden leer». Ahora dice que están vigentes.

### Al actualizar

- La migración de base de datos se aplica sola al arrancar el Panel.
- Los backups vienen desactivados: actívalos en Configuración → Backups y guarda el kit de
  recuperación **y** la `ENCRYPTION_KEY` del `.env` fuera de la VPS.

## [2.1.1] - 2026-10-14

Discord vuelve a recibir los avisos de deploy, el disco de la VPS deja de llenarse y las sesiones se cierran al eliminar un usuario o cambiar su contraseña.

### Correcciones

- Las notificaciones de deploy a un webhook de **Discord** fallaban con un error 400 porque Discord
  no entendía el formato. Ahora llegan como un mensaje con el resultado, el proyecto, la rama, el
  commit y las últimas líneas del log. Los webhooks de Slack también reciben su formato; cualquier
  otra URL sigue recibiendo el mismo JSON de siempre.
- Si un webhook rechaza una notificación, Configuración muestra el motivo que da el destino y no
  solo el código de error.

- Los logs de los contenedores ya no crecen sin límite hasta **llenar el disco** de la VPS: cada
  contenedor guarda como máximo 3 ficheros de 10 MB. Se aplica a cada proyecto en su próximo
  deploy; si un compose define su propio `logging`, se respeta.
- Cada deploy correcto **libera espacio**: borra las imágenes que ya no usa ningún contenedor y la
  caché de build que lleva más de 7 días sin usarse. Hacer rollback sigue funcionando igual.

### Seguridad

- Al **eliminar un usuario** o **cambiarle la contraseña**, sus sesiones abiertas se cierran al
  momento. Antes seguían funcionando hasta que caducaban, hasta 30 días después.
- La sesión caduca tras **7 días** sin usar el panel (antes, 30).

### Al actualizar

- La migración de base de datos se aplica sola al arrancar el panel.
- Todos los usuarios tendrán que volver a iniciar sesión una vez.
- Para liberar ya el espacio ocupado y aplicar el límite de logs a Traefik, PostgreSQL y los
  proyectos existentes, sigue los pasos de `production.md`, § B5.

## [2.1.0] - 2026-10-14

Control de los deploys, estado de Traefik en el Dashboard, logs en su propia pestaña y varias mejoras de seguridad.

### Novedades

- **Cancelar un deploy** en curso desde el detalle del proyecto, con confirmación. El proyecto
  vuelve al estado real de sus contenedores: si se cancela durante el build, la versión anterior
  sigue funcionando.
- **Tiempo máximo de deploy** en Configuración → Deploys (30 minutos por defecto; 0 lo
  desactiva). Si un deploy lo supera se cancela solo y se avisa por los canales de notificación.
- Pestaña **Logs** en el detalle del proyecto, con los mismos filtros que la ventana de logs.
- El Dashboard muestra el estado de **Traefik** y avisa si los certificados no se pueden leer.
- Página **Novedades** con el historial de versiones.
- Los proyectos Node.js reciben `GIT_SHA_SHORT` (el commit desplegado) durante el build, igual
  que los proyectos compose y Dockerfile.
- Los errores inesperados del servidor se envían a Sentry cuando `SENTRY_DSN` está configurado.

### Correcciones

- Si el panel se reiniciaba en mitad de un deploy, el proyecto se quedaba en «deploying» para
  siempre y el auto-deploy dejaba de funcionar. Ahora se cierra al arrancar el panel.
- El visor de logs ya no se queda en «Esperando logs…» cuando el proyecto no tiene contenedores,
  y avisa cuando los contenedores se detienen.
- Las notificaciones de Telegram distinguen un deploy cancelado por tiempo (⏱️) de uno fallido.

### Seguridad

- Límite de 10 intentos de inicio de sesión por minuto desde la misma IP.
- El gestor de ficheros de los volúmenes ya no permite borrar el volumen entero con rutas
  como «.».
- Los proyectos Node.js se construyen con Node 22: Node 20 ya no recibe parches de seguridad.
  Cada proyecto cambia de versión en su próximo deploy.
- Las imágenes de los proyectos Node.js ya no incluyen el historial `.git` del repositorio.

## [2.0.1] - 2026-10-13

Arreglo de rendimiento: el panel vuelve a ir rápido.

### Correcciones

- Dashboard, Proyectos y el detalle de cada proyecto tardaban unos 5 segundos en cargar.
- Los proyectos con HTTPS activo aparecían como «sin certificado».
- Pantalla de carga al cambiar de sección, en lugar de quedarse la anterior hasta tener datos.

## [2.0 y anteriores]

Todo lo que el panel ya hacía antes de llevar un registro de versiones.

### Novedades

- Rediseño del panel: búsqueda rápida (⌘K), proyectos fijados, tema claro y oscuro y Dashboard
  con lo que requiere atención.
- Deploys desde GitHub con webhook, auto-deploy, historial con logs en tiempo real y rollback.
- Tipos de proyecto Docker Compose (desde el repositorio o editado en el panel), Dockerfile,
  Node.js e imagen.
- Variables de entorno cifradas, con variables de build e importación desde un `.env`.
- Volúmenes persistentes con gestor de ficheros.
- Credenciales SSH para repositorios privados.
- Dominios con certificado SSL automático a través de Traefik.
- Notificaciones de deploy por webhook, email y Telegram.
- Gestión de usuarios y métricas del VPS.
