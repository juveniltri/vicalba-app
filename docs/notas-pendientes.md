# Notas pendientes

## Estado actual (octubre 2026)

Todo lo descrito en `CLAUDE.md` § "Estado actual del proyecto" está en master y en producción.
Este fichero recoge únicamente deuda técnica conocida y decisiones pendientes.

---

## Deuda técnica

- ~~**Deploy real no testeado en VPS**~~: validado en octubre 2026 — auto-deploy vía webhook de GitHub funcionando de punta a punta en la VPS.

- **Logs SSE con proyecto sin contenedores**: si el proyecto no tiene contenedores activos, `streamProyectoLogs` no emite nada y el SSE queda abierto indefinidamente. Considerar emitir un evento de cierre o un mensaje de "sin contenedores".

- ~~**Variables de entorno en deploy**~~: resuelto. El webhook route ahora descifra las `VariableEntorno` del proyecto y las pasa a `ejecutarDeploy`, que escribe un `.env.panel` temporal, lo pasa con `--env-file` a `docker compose`, y lo borra en el bloque `finally`. Mismo patrón que tRPC `deploy` y `rollback`.

- **Tests de volúmenes en Windows**: 3 tests de `src/app/api/volumes/[id]/files` (download ZIP y mkdir) fallan en Windows y pasan en CI (Linux). Probablemente por separadores de ruta; no afecta a producción.

- **Lock file entre plataformas**: el `package-lock.json` regenerado en Windows cambia los flags `peer` y añade `@emnapi/*`, y `npm ci` falla con un lock generado en macOS. CI usa `npm install --prefer-offline`.

- **Entorno dev sin Docker daemon**: las llamadas a dockerode se silencian en desarrollo con un `console.warn`. Valorar un mock de dockerode para tests de integración más realistas.

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
