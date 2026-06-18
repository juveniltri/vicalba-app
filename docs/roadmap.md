# Roadmap — vicalba-app

Ideas, features y mejoras pendientes. Sin orden de prioridad hasta que se planifiquen.
Para convertir items en issues de GitHub: `/to-issues`.

---

## Bugs conocidos

- **Variables de entorno no llegan al contenedor tras el deploy** — al añadir variables en el panel y redesplegar, el contenedor no las recibe. Workaround actual: copiar `.env` manualmente dentro del Docker. Investigar cómo `deployProyecto` escribe y pasa el `.env` al `docker compose`.

---

## Backlog

### Features

- **Gestión de usuarios** — CRUD de usuarios del panel + cambio de contraseña. Actualmente solo existe el usuario configurado en variables de entorno.

- **Logs en tiempo real durante el deploy** — capturar stdout/stderr del proceso de deploy (git clone, docker compose build/up) y streamearlo via SSE igual que los logs de contenedor. Actualmente el deploy es opaco hasta que termina.

- **Volúmenes persistentes + gestor de ficheros** — crear volúmenes Docker montados en rutas específicas del contenedor (ej. `/app/public/galeria`) y exponer un file browser en el panel para subir, descargar y eliminar ficheros. Caso de uso: imágenes de galería, assets estáticos, ficheros de configuración que viven fuera del repositorio. Referencia: gestor de ficheros de Coolify.

- **Import masivo de variables de entorno** — textarea donde pegar el contenido de un `.env` completo y que el panel lo parsee e importe todas las variables de golpe, en lugar de añadirlas una a una.

### Mejoras UX / UI

- **Vista de logs más grande** — el panel de logs actual se ve demasiado pequeño. Opciones: panel redimensionable, modo pantalla completa, o aumentar tamaño de fuente base.

### Técnico / Refactor

- **Botón Reiniciar = `docker restart`** — verificar si el restart actual hace stop+start o llama a `docker restart`. Si es lo primero, cambiarlo: `docker restart` es más rápido y no recrea el contenedor.

- **Revisión de deuda técnica** — pendiente concretar áreas específicas.

---

## Descartado

<!-- Ideas que se han considerado y descartado, con motivo -->
