# Notas pendientes

## Estado actual (octubre 2026)

Todo lo descrito en `CLAUDE.md` § "Estado actual del proyecto" está en master. La 2.2.0
(publicada el 14/10/2026) está pendiente de desplegar en la VPS: ver «Operación al desplegar la
2.2.0». Este fichero recoge también la deuda técnica conocida y las decisiones pendientes.

---

## Deuda técnica

- ~~**Deploy real no testeado en VPS**~~: validado en octubre 2026 — auto-deploy vía webhook de GitHub funcionando de punta a punta en la VPS.

- ~~**Logs SSE con proyecto sin contenedores**~~: resuelto. El servidor emite `sin_contenedores` o `fin` (contenedores detenidos) antes de cerrar y el visor lo muestra en vez de quedarse en «Esperando logs…».

- ~~**Variables de entorno en deploy**~~: resuelto. El webhook route ahora descifra las `VariableEntorno` del proyecto y las pasa a `ejecutarDeploy`, que escribe un `.env.panel` temporal, lo pasa con `--env-file` a `docker compose`, y lo borra en el bloque `finally`. Mismo patrón que tRPC `deploy` y `rollback`.

- ~~**Tests de volúmenes en Windows**~~: resuelto. La comprobación anti path-traversal comparaba la base POSIX sin resolver; ahora todas las rutas de volúmenes usan `resolverRutaSegura` (`src/lib/volumenes.ts`).

- **Lock file entre plataformas**: el `package-lock.json` regenerado en Windows cambia los flags `peer` y añade `@emnapi/*`, y `npm ci` falla con un lock generado en macOS. CI usa `npm install --prefer-offline`.

- **Entorno dev sin Docker daemon**: las llamadas a dockerode se silencian en desarrollo con un `console.warn`. Valorar un mock de dockerode para tests de integración más realistas.

---

## Operación al desplegar la 2.3.0 (Proxy y servicios)

1. **Antes** de actualizar: `mkdir -p /var/vicalba/traefik/static && chown 1001:1001 /var/vicalba/traefik/static`
   (si lo crea Docker al arrancar, queda de root y el Panel no puede escribir el `traefik.yml`).
2. `git pull && docker compose up -d --build` — el stack completo: cambian la imagen de Traefik
   (fijada a v3.7.15), su `command`, sus volúmenes y el puerto local del Panel. Traefik se reinicia
   hasta que el Panel escribe `static/traefik.yml` al arrancar (unos segundos). Las migraciones
   (rutas, middlewares, Configuración → Proxy) se aplican solas: cada dominio pasa a ser la primera
   ruta de su Proyecto y los ficheros de `dynamic/` se renombran a `<cliente>_<proyecto>.yml`.
3. Comprobar que el Panel y los dominios responden; `ls /var/vicalba/traefik/dynamic` sin `<proyecto>.yml` antiguos.
4. Redesplegar los Proyectos dockerfile/nodejs/image: dejan de publicar su puerto en la VPS (solo
   por sus dominios) y los `image` pasan a conectarse a la red del Cliente.
5. Probar el acceso de emergencia: `ssh -L 3000:localhost:3000 <vps>` y abrir `http://localhost:3000`.
6. El email de Let's Encrypt (`ACME_EMAIL`) ahora sí llega a Traefik (antes se ignoraba el flag).
7. **Antes de producción, en la VPS de desarrollo** con un subdominio en la cuenta de Cloudflare:
   - token con permiso Zone → DNS → Edit en Configuración → Proxy, ruta «Detrás de Cloudflare» con
     nube naranja → el certificado sale por DNS-01 (Dominios: «SSL activo»; log de Traefik sin errores ACME);
   - sin token → sale por HTTP-01 a través de Cloudflare (modo SSL «Full» mientras no hay certificado);
   - con «Cloudflare delante» y una lista de IPs en la ruta, entrar desde una IP permitida y otra no;
     la app ve la IP real en `X-Forwarded-For`/`X-Real-Ip`.

## Operación al desplegar la 2.2.0 (backups)

1. `git pull && docker compose up -d --build panel` — la migración de backups se aplica sola.
2. En **Configuración → Backups**, configurar el destino y «Probar y guardar».
3. Guardar el **kit de recuperación** y la `ENCRYPTION_KEY` del `.env` fuera de la VPS (gestor de
   contraseñas) y confirmar en el panel.
4. Activar la copia diaria; comprobar al día siguiente en el Historial que salió correcta.
5. Recomendado: un simulacro de recuperación (`docs/recuperacion.md`) en una VPS de usar y tirar.

---

## Operación al desplegar la 2.1.1 (espacio en disco)

La 2.1.1 limita los logs (3 × 10 MB por contenedor) y limpia imágenes y caché tras cada deploy,
pero los contenedores que ya existen conservan su configuración de logs hasta que se recrean.

1. **Ver qué ocupa espacio y liberarlo ya** (los contenedores siguen funcionando):

   ```bash
   df -h /
   docker system df
   sudo sh -c 'du -h /var/lib/docker/containers/*/*-json.log | sort -h | tail'
   sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log'
   docker image prune -f
   docker builder prune -f --filter until=168h
   ```

2. **Actualizar el stack completo**, no solo el panel, para que Traefik y PostgreSQL también
   tengan el límite: `git pull && docker compose up -d --build` (los recrea; segundos sin servicio).
3. **Redesplegar cada proyecto** una vez para que sus contenedores tengan el límite.
4. **Opcional — red de seguridad para cualquier contenedor**, también los no creados por el panel:
   `/etc/docker/daemon.json` con
   `{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }` y
   `sudo systemctl restart docker` (reinicia todos los contenedores; vuelven solos por su
   `restart`). Solo afecta a contenedores creados después.
5. Todos los usuarios tendrán que volver a iniciar sesión una vez.

---

## Operación pendiente tras desplegar la 2.1.0

- **Activar Sentry**: crear el proyecto en sentry.io (Next.js) y poner `SENTRY_DSN` en el `.env` de la VPS. Sin DSN el panel funciona igual y no envía errores.
- **Vigilar el primer deploy de cada proyecto Node.js**: pasan de Node 20 a Node 22. Revisar los que fijen `engines.node` o usen módulos nativos antiguos.

---

## Decisiones pendientes

- ~~**Tipos de proyecto**~~: resuelto. Implementado enum `TipoProyecto` (`compose | dockerfile | nodejs | image`) con deploy multi-tipo, formulario dinámico y campos por tipo.

- **Documentación OpenAPI**: exponer un spec OpenAPI (Swagger) para todos los endpoints REST del panel:
  - `GET /api/health`
  - `GET /api/projects/[id]/logs` (SSE)
  - `GET /api/system/metrics`
  - `POST /api/webhooks/github`
  - Opciones a evaluar: [`@scalar/nextjs-api-reference`](https://github.com/scalar/scalar) + generación de spec manual con Zod-to-OpenAPI, o `trpc-openapi` para exponer también los procedures tRPC como REST documentado.
  - Pendiente de diseño previo — decide si se documenta solo el REST público o también tRPC.
