# Guía de usuario con capturas (v2.2.0)

Fecha: 14/10/2026 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Una guía de uso del Panel que sirva a la vez para **incorporar a alguien nuevo** (tareas paso a
paso) y como **referencia del equipo** (qué hace cada pantalla y cada opción), con capturas reales
de la interfaz. Se consulta desde el propio Panel (página «Guía») y se descarga en PDF. Las
capturas y el PDF se regeneran con un comando cuando cambia la interfaz.

**Éxito:** una persona que no conoce el Panel da de alta un Cliente y un Proyecto, lo despliega,
mira sus logs, hace rollback y activa los backups solo con la guía; y regenerar capturas y PDF
tras un cambio de UI es ejecutar `npm run guia` y revisar el diff.

### Decisiones tomadas

| Tema        | Decisión                                                                           |
| ----------- | ---------------------------------------------------------------------------------- |
| Lectores    | Ambos: Parte I tareas paso a paso, Parte II referencia por pantallas               |
| Capturas    | Script con Playwright que siembra datos de demostración y captura (`npm run guia`) |
| Acceso      | Página `/guia` en el Panel + botón «Descargar PDF»; ambas del mismo Markdown       |
| Alcance     | Primeros pasos, Clientes y Proyectos, Deploys y operación, Configuración y backups |
| Herramienta | Playwright para capturas **y** PDF (imprime la propia página `/guia`)              |
| Entrega     | Rama `feature/guia-usuario` desde `develop`, PR propio, antes de `release/2.2.0`   |

### Fuera de alcance

Vídeos o GIFs, varios idiomas, ejecutar `npm run guia` en la CI, tests E2E (Playwright queda
instalado y servirá de base para ellos, pero los E2E son otro trabajo del roadmap).

## Contenido (`docs/guia-usuario.md`)

Un solo fichero Markdown en español, con el vocabulario de `CONTEXT.md` (Panel, Cliente,
Proyecto, Servicio, Deploy…).

**Parte I — Tareas paso a paso.** Cada tarea: objetivo en una frase, pasos numerados, una o dos
capturas y un apartado «Si algo falla».

1. Entrar y orientarse: login, Dashboard, barra lateral, búsqueda ⌘K, proyectos fijados, tema.
2. Dar de alta un Cliente y su primer Proyecto (tipo compose desde repositorio).
3. Desplegar y seguir el deploy: log por fases, cancelar.
4. Activar el auto-deploy con el webhook de GitHub.
5. Añadir variables de entorno (también importar un `.env`).
6. Ver los logs de un contenedor: filtros por nivel y por servicio.
7. Hacer rollback a un commit anterior.
8. Activar los backups: destino, kit de recuperación, programación.
9. Restaurar una copia.

**Parte II — Referencia por pantallas.** Dashboard; Proyectos (lista, filtros, búsqueda);
detalle de Proyecto (pestañas, acciones, zona peligrosa); formulario de Proyecto (los cuatro
tipos y sus campos); volúmenes y explorador de ficheros; editor de compose; Configuración por
secciones (Notificaciones, Deploys, Backups, Credenciales SSH, Webhook, Sistema); Usuarios;
Novedades.

**Anexos.** Glosario breve (términos de `CONTEXT.md` que ve el usuario), estados y sus colores,
y enlace a `docs/recuperacion.md`.

**Capturas.** Entre 25 y 30 PNG en `public/guia/` con nombres estables (`dashboard.png`,
`proyecto-deploys.png`…). Tema claro, ventana de 1440×900, solo datos ficticios (clientes
`acme`, `tienda-mari`…, dominios `*.example.com`). En el Markdown se referencian con ruta
relativa (`../public/guia/dashboard.png`) para que también se vean en GitHub.

## Generación (`npm run guia`)

**Dependencias nuevas:** `@playwright/test` (desarrollo) y Chromium
(`npx playwright install chromium`); `react-markdown` (producción, para la página). Requisitos
para ejecutarlo: Docker en marcha y los puertos 80/443 libres.

**Script `scripts/guia/generar.ts`** (se ejecuta con `tsx`). El Panel de la guía corre con la
**imagen Docker de producción**: la sección Backups llama a restic y `pg_dump` desde el servidor,
que solo existen en la imagen, y así las capturas se ven exactamente como en la VPS. En orden:

1. **Comprobaciones previas.** Docker responde, los puertos 80 y 443 están libres y no existe
   ningún contenedor `traefik`, `vicalba-db` ni `vicalba-panel` (los nombres del
   `docker-compose.yml` son fijos). Si algo falla, lo dice y termina sin tocar nada.
2. **Stack de la guía.** `docker compose -p vicalba-guia -f docker-compose.yml
-f scripts/guia/compose.guia.yml up -d --build` con un `.env` generado por el script (secretos
   aleatorios, `PANEL_DOMAIN=localhost`). El override:
   - publica la BD en un puerto local para sembrarla;
   - sustituye los montajes de `/var/vicalba/...` por **volúmenes con nombre** (el script les da
     dueño uid 1001), para no tocar nunca carpetas del equipo;
   - sustituye el montaje `/:/hostroot` (no funciona en Docker Desktop);
   - conecta el Panel a la red `vicalba-guia-demo`, donde vive el SFTP de demostración.
3. **Datos de demostración.** Con las migraciones ya aplicadas por el arranque del Panel, siembra
   con `scripts/guia/datos-demo.ts` (cifrando con la `ENCRYPTION_KEY` del `.env` generado):
   - 3 Clientes y unos 6 Proyectos de los cuatro tipos, con dominios `*.example.com`;
   - deploys con salida por fases (uno en error, con un commit anterior para el rollback; uno
     cancelado), variables de entorno y volúmenes;
   - backups con destino **SFTP de demostración** (`lscr.io/linuxserver/openssh-server` en la
     red `vicalba-guia-demo`, clave generada por el script), clave confirmada, programación e
     historial con copias correctas, una fallida y una restauración;
   - notificaciones con estado del último envío, dos usuarios y la credencial SSH del SFTP.
     El usuario demo y su contraseña los define el propio script.
4. **Contenedores de demostración.** Un `nginx:alpine` por cada Proyecto que debe verse
   «running», con la etiqueta `com.docker.compose.project=<clienteSlug>-<nombre>` que usa el
   Panel, y un `alpine` que escribe en bucle líneas JSON en formato Pino con niveles
   INFO/WARN/ERROR para la captura del visor de logs. Todos llevan la etiqueta `vicalba.guia=1`.
5. **Capturas.** Playwright entra en `https://localhost` (certificado autofirmado de Traefik
   aceptado), inicia sesión con el usuario demo, fija el tema claro y 1440×900, y recorre una
   lista de pasos con nombre (`scripts/guia/capturas.ts`). Cada paso navega, prepara el estado
   (abrir un modal, rellenar un formulario, desplegar un menú) y guarda la página entera o un
   elemento concreto en `public/guia/<nombre>.png`. Antes de las capturas de Backups, pulsa
   «Hacer copia ahora» para que «Copias disponibles» liste copias reales del SFTP. Ninguna
   pantalla llama a un servicio externo real (GitHub, S3, correo).
6. **PDF.** Playwright abre `/guia` y la imprime a `public/guia/guia-usuario.pdf`: A4, márgenes,
   pie con título y número de página, fondo impreso. Como la página se sirve desde la imagen,
   el script copia antes el Markdown y las PNG recién generadas al contenedor (o reconstruye la
   imagen tras las capturas); el plan elige la opción más simple que funcione.
7. **Limpieza (siempre, también si falla un paso).** `docker compose -p vicalba-guia down -v`,
   borra los contenedores con la etiqueta `vicalba.guia=1`, el SFTP de demostración, la red y el
   `.env` y la clave generados.

Las PNG y el PDF se versionan en el repo (unos pocos MB). El script no va en la CI; se ejecuta
a mano cuando cambia la interfaz y se revisa el diff de las imágenes.

## Página «Guía» en el Panel

- **Ruta** `src/app/(panel)/guia/page.tsx`, protegida como el resto (sesión obligatoria). Las
  imágenes y el PDF de `public/guia/` también quedan detrás del login, porque el matcher de
  `src/proxy.ts` solo excluye `login`, `api` y `_next`.
- **Navegación**: entrada «Guía» en la barra lateral (junto a Novedades) y en la lista de
  páginas de la búsqueda ⌘K.
- **Lectura**: como Novedades con el CHANGELOG. `src/lib/guia.ts` (puro, 100 %) lee
  `docs/guia-usuario.md` y expone:
  - `leerGuia(): Promise<string | null>` — el Markdown, o `null` si el fichero no está;
  - `indiceGuia(md): Array<{ nivel: 1 | 2; texto: string; ancla: string }>` — títulos `#`
    (partes: «Parte I — Tareas», «Parte II — Referencia», «Anexos») y `##` (cada tarea o
    pantalla), con anclas únicas (minúsculas, sin acentos, guiones; sufijo `-2`, `-3` si se
    repiten). Los `###` no entran en el índice;
  - `rutaImagen(src): string` — `../public/guia/x.png` → `/guia/x.png`; el resto, igual.
- **Imagen Docker**: excepción `!docs/guia-usuario.md` en `.dockerignore` y `COPY` en el
  `Dockerfile`, igual que `CHANGELOG.md`. Si falta, la página muestra «La guía no está
  disponible en esta instalación» en lugar de fallar.
- **Componente** `src/components/guia/GuiaUsuario.tsx`: `react-markdown` **sin** HTML crudo
  (sin `rehype-raw`), títulos con su ancla, imágenes con `rutaImagen` que se abren a tamaño real
  en otra pestaña al hacer clic, estilos con los tokens del Panel (claro y oscuro).
- **Índice** lateral fijo en escritorio y desplegable en móvil, desde `indiceGuia`.
- **Botón** «Descargar PDF» (`/guia/guia-usuario.pdf`, atributo `download`).
- **Impresión** (`@media print`): oculta la barra lateral del Panel, el índice y el botón; salto
  de página antes de cada título `#` y `##` (cada parte, tarea o pantalla empieza en página
  nueva); las imágenes no se parten entre páginas.

## Pruebas

- `src/lib/guia.ts` al 100 % (añadido a los umbrales de `vitest.config.ts`): índice con títulos
  repetidos y con acentos, reescritura de rutas, fichero ausente.
- `GuiaUsuario` ≥ 80 %: pinta títulos con ancla, reescribe las imágenes, enlace al PDF, no
  interpreta HTML incrustado.
- Barra lateral y ⌘K: la entrada «Guía» aparece.
- El script (infraestructura, `scripts/`) no lleva tests unitarios: se verifica ejecutándolo; el
  PR incluye la ejecución (capturas y PDF generados) y se ejecuta dos veces seguidas para
  comprobar que la limpieza deja el equipo como estaba.

## Documentación

`CLAUDE.md` (scripts npm: `npm run guia`; nota de cómo regenerar la guía), `CHANGELOG.md`
(2.2.0: «Guía de uso en el Panel y en PDF») y `docs/roadmap.md`.
