# Notas pendientes

## Estado actual (junio 2026)

Todo lo descrito en `CLAUDE.md` § "Estado actual del proyecto" está en master y en producción.
Este fichero recoge únicamente deuda técnica conocida y decisiones pendientes.

---

## Deuda técnica

- **Deploy real no testeado en VPS**: el refactor de deploy vía compose labels (`-p ${clienteSlug}-${proyectoNombre}`) funciona localmente. Pendiente de validar el flujo completo (clone → `docker compose up`) contra un repositorio GitHub real en la VPS.

- **Logs SSE con proyecto sin contenedores**: si el proyecto no tiene contenedores activos, `streamProyectoLogs` no emite nada y el SSE queda abierto indefinidamente. Considerar emitir un evento de cierre o un mensaje de "sin contenedores".

- **Variables de entorno en deploy**: el `docker compose` ejecutado en deploy no inyecta automáticamente las variables de entorno cifradas en BD. Pendiente decidir estrategia (archivo `.env` temporal, `--env-file`, o variables de entorno del proceso).

- **Entorno dev sin Docker daemon**: las llamadas a dockerode se silencian en desarrollo con un `console.warn`. Valorar un mock de dockerode para tests de integración más realistas.

---

## Decisiones pendientes

- **Próxima feature**: sin hito definido. Candidatos: monitorización de recursos (CPU/RAM por proyecto), soporte multi-VPS, o interfaz de logs persistente.
