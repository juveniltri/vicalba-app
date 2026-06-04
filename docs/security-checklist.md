# Security Checklist — Pre-release

> Este checklist es obligatorio antes de cualquier merge a `main` cuando el PR toca autenticación, sesiones, datos de usuario o endpoints sensibles.

---

## Autenticación y sesiones

- [ ] Tokens y cookies configurados con `HttpOnly`, `Secure`, `SameSite=Strict`
- [ ] Sesiones expiran — tiempo de expiración definido y probado
- [ ] Logout invalida la sesión en el servidor (no solo borra la cookie)
- [ ] Rutas protegidas devuelven 401/403, no redirigen silenciosamente a datos de otro usuario
- [ ] Implementado rate limiting en endpoints de login y registro

## Inputs y datos del usuario

- [ ] Toda entrada del usuario validada con Zod en el boundary del servidor
- [ ] Parámetros de URL y query strings validados antes de usarlos
- [ ] Respuestas de APIs externas validadas con Zod antes de procesar
- [ ] Sin interpolación directa de inputs en queries SQL — ORM con queries parametrizadas siempre
- [ ] Uploads de ficheros: tipo MIME verificado en el servidor (no solo extensión)

## XSS

- [ ] Sin uso de `dangerouslySetInnerHTML` sin sanitización explícita
- [ ] Datos del usuario no se insertan en el DOM sin escapar
- [ ] CSP configurada y activa — sin `unsafe-inline` en scripts salvo justificación documentada
- [ ] Headers `Content-Type` correctos en todas las respuestas API

## CSRF

- [ ] Tokens CSRF presentes en todas las operaciones que muten estado (POST, PUT, PATCH, DELETE)
- [ ] El token se verifica en el servidor, no solo en el cliente
- [ ] `SameSite=Strict` en cookies de sesión como capa adicional

## Headers HTTP

- [ ] `X-Frame-Options: DENY` (o `SAMEORIGIN` si hay iframes propios)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy` configurada (cámara, micrófono, geolocalización)
- [ ] `Strict-Transport-Security` (HSTS) activo en producción
- [ ] CSP definida con directivas `script-src`, `style-src`, `img-src`, `connect-src`

## Datos sensibles

- [ ] Sin secrets o tokens en logs, mensajes de error o respuestas de API
- [ ] Datos sensibles del usuario no aparecen en URLs (query params o path)
- [ ] PII (datos personales) no se almacena en localStorage ni sessionStorage
- [ ] Backups y datos de prueba anonimizados (no usar datos reales de producción en staging)

## Dependencias e infraestructura

- [ ] `npm audit --audit-level=high` pasa sin vulnerabilidades
- [ ] HTTPS forzado — HTTP redirige a HTTPS en todos los entornos excepto local
- [ ] Variables de entorno sensibles no expuestas al cliente (`NEXT_PUBLIC_` o equivalente)
- [ ] `.env` y `.env.local` en `.gitignore` — verificado

## RGPD / privacidad (si aplica datos de usuarios europeos)

- [ ] Política de privacidad accesible y actualizada
- [ ] Consentimiento de cookies implementado si hay tracking
- [ ] Datos personales encriptados en reposo si son sensibles (salud, financieros)
- [ ] Mecanismo de eliminación de cuenta / datos implementado
- [ ] Logs no contienen PII sin anonimizar

---

## Resultado

- **Todo marcado** → listo para merge a `main`
- **Algún punto sin marcar** → crear issue con label `security` y no mergear hasta resolver
