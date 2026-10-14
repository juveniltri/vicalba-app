# Changelog

Cambios del Panel visibles para quien lo usa. El panel lo muestra en la página
Novedades. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/):
cada versión con su fecha, un resumen de una línea y los apartados Novedades,
Correcciones y Seguridad.

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
  proyectos existentes, sigue los pasos de `docs/notas-pendientes.md`.

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
