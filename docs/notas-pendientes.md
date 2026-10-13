# Notas pendientes

## Estado actual (octubre 2026)

Todo lo descrito en `CLAUDE.md` § "Estado actual del proyecto" está en master y en producción.
Este fichero recoge únicamente deuda técnica conocida y decisiones pendientes.

---

## Deuda técnica

- ~~**Deploy real no testeado en VPS**~~: validado en octubre 2026 — auto-deploy vía webhook de GitHub funcionando de punta a punta en la VPS.

- ~~**Logs SSE con proyecto sin contenedores**~~: resuelto. El servidor emite `sin_contenedores` o `fin` (contenedores detenidos) antes de cerrar y el visor lo muestra en vez de quedarse en «Esperando logs…».

- ~~**Variables de entorno en deploy**~~: resuelto. El webhook route ahora descifra las `VariableEntorno` del proyecto y las pasa a `ejecutarDeploy`, que escribe un `.env.panel` temporal, lo pasa con `--env-file` a `docker compose`, y lo borra en el bloque `finally`. Mismo patrón que tRPC `deploy` y `rollback`.

- ~~**Tests de volúmenes en Windows**~~: resuelto. La comprobación anti path-traversal comparaba la base POSIX sin resolver; ahora todas las rutas de volúmenes usan `resolverRutaSegura` (`src/lib/volumenes.ts`).

- **Lock file entre plataformas**: el `package-lock.json` regenerado en Windows cambia los flags `peer` y añade `@emnapi/*`, y `npm ci` falla con un lock generado en macOS. CI usa `npm install --prefer-offline`.

- **Entorno dev sin Docker daemon**: las llamadas a dockerode se silencian en desarrollo con un `console.warn`. Valorar un mock de dockerode para tests de integración más realistas.

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
