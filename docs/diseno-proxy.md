# Diseño — Proxy y servicios (2.3.0)

Estado: revisado con `/grill-me` (16/10/2026). Rama: `feature/2.3.0`.

## Objetivo

Que la configuración de Traefik deje de ser una caja negra:

- cada Proyecto puede publicar **varios servicios** de su compose, con varios dominios y paths;
- cada ruta lleva los **middlewares** habituales (www, auth básica, IPs, cabeceras, límite de peticiones, body, compresión);
- los ajustes **globales** del Proxy (cabeceras reenviadas, timeouts, TLS, log) se ven y se editan desde Configuración → Proxy;
- un **modo Cloudflare** deja el Proxy listo para tener Cloudflare delante.

Y además, en la misma versión, **acciones por Servicio** (iniciar/detener/reiniciar uno solo), ya implementadas.

## Situación actual

- Un Proyecto tiene como mucho un `dominio` y un `puerto`. `generarConfigTraefik` escribe un router `Host()` → `http://<cliente>-<proyecto>:<puerto>`, donde `<cliente>-<proyecto>` es un alias de red que `conectarContenedoresARedCliente` pone a **un solo** contenedor en la red del cliente.
- El fichero dinámico se llama `dynamic/<nombre>.yml`. **Bug:** el nombre de Proyecto solo es único por Cliente, así que dos Clientes con un Proyecto `web` se pisan la configuración.
- La configuración estática (`traefik/traefik.yml`) viene del repo, montada `:ro`. Entrypoint `websecure` sin `forwardedHeaders`: Traefik descarta los `X-Forwarded-*` entrantes y pone la IP real. Correcto mientras Traefik sea la entrada.
- Certificados con `tlsChallenge` (TLS-ALPN-01), que **no funciona detrás del proxy de Cloudflare**.
- Imagen `traefik:v3` sin fijar.
- El propio Panel se enruta por Traefik (labels en `docker-compose.yml`): si Traefik cae, se pierde el acceso al Panel.

## Decisiones

1. **Un único Traefik para toda la VPS.** Solo un proceso puede escuchar en 80/443; uno por Proyecto exigiría otro proxy delante. El aislamiento entre Proyectos se consigue con un fichero dinámico por Proyecto, nombres con prefijo, dominios únicos en BD y la Red de proyecto que ya existe.
2. **Configuración estructurada, no YAML libre.** El Panel genera todo el YAML desde la BD; el usuario ve el YAML generado (solo lectura).
3. **Acceso de emergencia al Panel:** además de Traefik, el Panel se publica en `127.0.0.1:3000` de la VPS (`ssh -L 3000:localhost:3000 vps`). No se expone a internet.
4. **Cambios estáticos con vuelta atrás automática** (ver entrega 3).

## Entrega 0 — Acciones por Servicio (hecha)

Commits `2dcad1e` y `0e2a942`: `servicio?` en iniciar/detener/reiniciar (etiqueta `com.docker.compose.service`), query `proyectos.servicios` con estado desde Docker, tarjeta «Servicios» en el detalle. Pendiente: probarlo en navegador con un compose real.

## Entrega 1 — Rutas múltiples

### Modelo

```prisma
model RutaProyecto {
  id          String   @id @default(cuid())
  proyectoId  String
  proyecto    Proyecto @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  dominio     String
  path        String?  // PathPrefix; null = todo el dominio
  servicio    String?  // servicio del compose; null en tipos dockerfile/nodejs/image
  puerto      Int
  redireccionWww RedireccionWww @default(ninguna)  // ninguna | a_raiz | a_www
  cloudflare  Boolean  @default(false)  // entrega 4
  middlewares Json     @default("{}")  // entrega 2, validado con Zod
  creadoEn    DateTime @default(now())
  actualizadoEn DateTime @updatedAt

  @@unique([dominio, path])
}
```

- `dominio` + `path` único en toda la VPS; también se rechaza el dominio del Panel (`PANEL_DOMAIN`).
- Migración: cada Proyecto con `dominio` crea una ruta (`puerto ?? 80`, `servicio` null). `Proyecto.dominio` se elimina; lo que hoy lo usa (SSL en el detalle, Dashboard, botón Abrir URL, índice ⌘K) pasa a la **ruta principal** (la más antigua; sin campo `principal` por ahora).
- `Proyecto.puerto` se queda: en dockerfile/nodejs/image es el puerto del contenedor y el valor por defecto de la ruta, que se puede cambiar (p. ej. un panel de métricas en otro puerto). Al cambiar `Proyecto.puerto` se arrastran las rutas que tenían el valor antiguo.
- Máximo 20 rutas por Proyecto.

### Enrutado

- Alias por Servicio en la red del cliente: `<cliente>-<proyecto>-<servicio>` para cada Servicio que aparezca en alguna ruta. Se mantiene `<cliente>-<proyecto>` para el Servicio de la primera ruta (compatibilidad). Rutas sin servicio → comportamiento actual.
- Fichero `dynamic/<cliente>-<proyecto>.yml` (corrige el bug); al regenerar se borra el antiguo `<nombre>.yml` si existe.
- Un router por ruta: `rule: Host(...) [&& PathPrefix(...)]`, `entryPoints: [websecure]`, `tls.certResolver`. Nombres con prefijo `<cliente>-<proyecto>-` y el id corto de la ruta.
- Función pura `generarConfigProyecto(proyecto, rutas, ajustes)` → YAML, con tests; se escribe al crear/editar/borrar rutas, en cada deploy y **al arrancar el Panel para todos los Proyectos**. Los ficheros llevan la cabecera `# generado por vicalba-panel`; al arrancar se borran los generados que ya no corresponden a ningún Proyecto (nunca los que no la llevan, como `_proxy.yml` o uno manual). Si un Proyecto falla, se registra y se sigue.
- Redirección www (`redireccionWww`): router aparte para el host secundario, con su propio certificado y `redirectRegex` 301 — si el DNS de `www` falla, el dominio principal no pierde su certificado. El host secundario cuenta para la unicidad. No se ofrece si el dominio ya empieza por `www.`.
- Servicio que desaparece del compose: el deploy no falla; tras el deploy se comprueba que cada Servicio con ruta tiene contenedor y, si no, aviso en el log del deploy, ruta marcada «servicio no encontrado» y entrada en «Requiere atención».

### UI

- Pestaña «Dominios» en el detalle: tabla de rutas (dominio, path, servicio —desplegable con `extraerServicios`/servicios en marcha; texto libre si no se conoce ninguno—, puerto, estado SSL por dominio), añadir/editar/borrar.
- «Ver YAML generado» (solo lectura).
- El formulario de crear Proyecto mantiene un campo de dominio opcional que crea la primera ruta.

## Entrega 2 — Middlewares por ruta

`RutaProyecto.middlewares` (JSON validado con un schema Zod versionado). Todos opcionales:

| Middleware             | Traefik                         | Notas                                                                                              |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| Autenticación básica   | `basicAuth`                     | bcrypt **coste 5** (Traefik lo comprueba en cada petición); la contraseña en claro nunca se guarda |
| IPs permitidas         | `ipAllowList`                   | Rangos CIDR validados; con Cloudflare, ver entrega 4                                               |
| Cabeceras de seguridad | `headers`                       | HSTS, nosniff, frame options, referrer policy, cabeceras propias                                   |
| Límite de peticiones   | `rateLimit`                     | `average`/`burst`; en memoria del Traefik                                                          |
| Tamaño máximo de body  | `buffering.maxRequestBodyBytes` |                                                                                                    |
| Compresión             | `compress`                      |                                                                                                    |

Por ruta, sin herencia del Proyecto; la UI ofrece «copiar middlewares de otra ruta». Middlewares nombrados `<cliente>-<proyecto>-<ruta>-<tipo>`, definidos en el mismo fichero del Proyecto (no hay referencias entre Proyectos).

## Entrega 3 — Proxy editable (Configuración → Proxy)

### Qué se edita

`ConfiguracionProxy` (fila única en BD):

- `forwardedHeaders.trustedIPs` del entrypoint `websecure` (`insecure` no se ofrece);
- timeouts (`respondingTimeouts.readTimeout`/`writeTimeout`/`idleTimeout`);
- nivel de log y access log on/off: a stdout del contenedor en JSON, **desactivado por defecto** (con tráfico rota rápido los 3 × 10 MB); visor en Configuración → Proxy reutilizando `VisorLogs` sobre el contenedor Traefik;
- versión mínima de TLS — es config **dinámica** (`tls.options.default`), se aplica sin reiniciar desde un fichero `dynamic/_proxy.yml`.

La pantalla muestra también lo que no se edita: entrypoints, resolvers, versión de Traefik.

### Dónde vive el fichero

- `traefik.yml` pasa a `/var/vicalba/traefik/static/traefik.yml`, generado por el Panel (directorio montado en Traefik y en el Panel). Se monta el **directorio**, no el fichero: si faltara el fichero, Docker crearía un directorio en su lugar.
- Al instalar/actualizar se copia el `traefik/traefik.yml` del repo como punto de partida (`### Al actualizar` del CHANGELOG, `dev.sh`, `scripts/guia`).
- Imagen de Traefik fijada a una versión exacta.
- Los backups incluyen `static/` y la restauración lo devuelve.

### Aplicar con red de seguridad

1. Validar con Zod y generar el YAML.
2. Guardar `traefik.yml.prev` y escribir el nuevo.
3. Reiniciar el contenedor Traefik (dockerode).
4. Comprobar: contenedor running y `ping` de Traefik respondiendo (entrypoint interno `ping`, solo en `vicalba-net`) durante ~20 s.
5. Si falla: restaurar `.prev`, reiniciar, avisar en la UI con el error y el log de Traefik. Si hasta eso falla: acceso de emergencia + `docs/recuperacion.md`.

La petición que pulsa «Aplicar» pasa por Traefik, así que se corta al reiniciarlo. Por eso la aplicación es una **operación en segundo plano con estado en BD** (patrón de los backups):

- la mutation valida, guarda la configuración pendiente, lanza la operación y responde antes de reiniciar;
- resultado `aplicada | revertida | error` con mensaje y últimas líneas del log de Traefik; al arrancar se cierran las operaciones `en_curso` huérfanas;
- una sola a la vez; se guardan por separado la configuración aplicada y la pendiente, y la UI muestra la aplicada (con aviso si la última se revirtió);
- la UI avisa de que el Panel puede dejar de responder unos segundos y consulta el estado hasta reconectar.

## Entrega 4 — Modo Cloudflare

Token de la API en Configuración → Proxy (uno para toda la VPS: los dominios estarán en nuestra cuenta de Cloudflare; Traefik lee las credenciales del proveedor DNS a nivel de proceso). Interruptor «Cloudflare» por ruta que aplica la IP real y el resolver.

- **IP real:** los rangos de Cloudflare (lista incluida en el código con fecha, y botón para actualizarla desde `cloudflare.com/ips-v4|v6`) se añaden a `trustedIPs`. No afecta a los Proyectos sin Cloudflare: solo se confía en cabeceras que llegan desde esas IPs.
- **Certificados:** segundo resolver `letsencrypt-dns` con `dnsChallenge` (proveedor `cloudflare`). El token de la API se guarda cifrado en BD y el Panel lo escribe en `static/cf-token`; Traefik lo lee con `CF_DNS_API_TOKEN_FILE` (variable fija en `docker-compose.yml`, así el token no exige recrear el contenedor). Las rutas con Cloudflare usan este resolver; si no hay token, un tercer resolver `letsencrypt-http` (`httpChallenge`), que pasa por el proxy de Cloudflare con SSL «Full».
- **Middlewares que miran la IP** (`ipAllowList`, `rateLimit`) en rutas con Cloudflare: `ipStrategy` que excluya los rangos de Cloudflare / `sourceCriterion` por `CF-Connecting-IP`. **Verificar en la VPS de desarrollo** cuál da la IP del visitante.
- Guía: modo SSL «Full (strict)» en Cloudflare.

## Riesgos

- **Traefik caído = Panel inaccesible.** Mitigado con vuelta atrás automática y acceso por `127.0.0.1:3000`.
- **Migración de dominios:** un fallo deja Proyectos sin ruta. La migración es SQL determinista y el YAML se regenera al arrancar el Panel para todos los Proyectos.
- **Cambio de instalación** (fichero estático fuera del repo, puerto local del Panel): documentado en `### Al actualizar`.
- **Límite de peticiones en memoria:** se reinicia con Traefik; suficiente para una sola VPS.

## Verificación

- Entregas 1 y 2, y la vuelta atrás de la 3: tests + stack local de `npm run guia`.
- Antes de publicar la 2.3.0: todo en la **VPS de desarrollo** (la que ya tiene un Panel), con un subdominio en Cloudflare — certificados por DNS challenge, IP real detrás de Cloudflare, vuelta atrás forzando una config que no arranca.
- Producción solo después.

## Más adelante

- Access log por Proyecto en su pestaña Logs (filtrando por router).
- Campo `principal` en la ruta si hace falta elegir el dominio principal.
- Un token de Cloudflare por Cliente (Traefik no lo permite de forma nativa).
