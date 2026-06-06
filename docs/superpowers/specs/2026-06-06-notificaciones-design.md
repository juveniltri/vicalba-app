# Notificaciones de Deploy — Spec de diseño

**Fecha:** 2026-06-06  
**Estado:** aprobado

---

## Contexto

El panel ejecuta deploys desde tres puntos: el procedure `proyectos.deploy`, el procedure `proyectos.rollback`, y el webhook de GitHub. Cuando un deploy termina (en éxito o en error), el equipo no recibe ninguna alerta. Esta feature añade notificaciones configurables por canal (webhook, email, Telegram) desde la página `/configuracion`.

---

## Arquitectura

```
ConfiguracionNotificacion (BD)
        ↓
src/lib/notificaciones/index.ts   (enviarNotificacion)
    ├── webhook.ts
    ├── email.ts
    └── telegram.ts
        ↓
proyectosRouter.deploy / rollback / webhook route
        ↓
configuracionRouter (obtener / guardar)
        ↓
/configuracion page → ConfiguracionNotificaciones componente
```

---

## Modelo de datos

```prisma
model ConfiguracionNotificacion {
  id String @id @default("default")

  webhookHabilitado  Boolean @default(false)
  webhookUrl         String?

  emailHabilitado    Boolean @default(false)
  emailSmtpHost      String?
  emailSmtpPort      Int?
  emailSmtpUser      String?
  emailSmtpPass      String?
  emailSmtpPassIv    String?
  emailSmtpPassTag   String?
  emailRemitente     String?
  emailDestinatario  String?

  telegramHabilitado Boolean @default(false)
  telegramBotToken   String?
  telegramChatId     String?
}
```

La contraseña SMTP se cifra con `cifrar`/`descifrar` (mismo mecanismo que variables de entorno). Los demás campos se guardan en claro.

---

## Capa de lógica

### Payload de notificación

```typescript
interface PayloadNotificacion {
  proyectoNombre: string;
  clienteSlug: string;
  rama: string;
  sha: string | null;
  resultado: "exito" | "error";
  output: string;
}
```

### `src/lib/notificaciones/index.ts`

```typescript
export async function enviarNotificacion(
  payload: PayloadNotificacion,
): Promise<void>;
```

- Lee `ConfiguracionNotificacion` de BD (id `"default"`)
- Si no existe el registro, retorna sin hacer nada
- Para cada canal habilitado, invoca el módulo correspondiente
- Usa `Promise.allSettled` — un canal fallido no cancela los otros
- Nunca lanza (absorbe todos los errores)

### `src/lib/notificaciones/webhook.ts`

```typescript
export async function enviarWebhook(
  url: string,
  payload: PayloadNotificacion,
): Promise<void>;
```

POST JSON al URL configurado con el payload completo. Content-Type: `application/json`.

### `src/lib/notificaciones/email.ts`

```typescript
export async function enviarEmail(
  config: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    remitente: string;
    destinatario: string;
  },
  payload: PayloadNotificacion,
): Promise<void>;
```

Usa `nodemailer`. Asunto: `[vicalba] Deploy ${resultado} — ${proyectoNombre}`. Cuerpo en texto plano con rama, sha y las últimas 50 líneas de output (truncado para no saturar el email).

### `src/lib/notificaciones/telegram.ts`

```typescript
export async function enviarTelegram(
  botToken: string,
  chatId: string,
  payload: PayloadNotificacion,
): Promise<void>;
```

`fetch` a `https://api.telegram.org/bot{token}/sendMessage` con mensaje en Markdown. El mensaje incluye resultado, proyecto, rama, sha y las últimas 20 líneas de output. Nunca lanza.

### Integración en callers

En `proyectosRouter.deploy`, `proyectosRouter.rollback`, y el webhook route, tras obtener el resultado de `ejecutarDeploy`:

```typescript
enviarNotificacion({
  proyectoNombre: proyecto.nombre,
  clienteSlug: proyecto.cliente.slug,
  rama: ...,
  sha: ...,
  resultado,
  output,
}).catch(() => {});
```

Fire & forget — no bloquea la respuesta.

### `src/server/routers/configuracion.ts`

```typescript
obtener: protectedProcedure.query(async () => {
  const config = await prisma.configuracionNotificacion.findUnique({
    where: { id: "default" },
  });
  // Devuelve config sin emailSmtpPass en claro (omitido o null)
  return { ...config, emailSmtpPass: null };
});

guardar: protectedProcedure
  .input(configuracionNotificacionInput)
  .mutation(async ({ input }) => {
    // Cifra emailSmtpPass si viene en el input
    // Upsert con id "default"
  });
```

El schema Zod de input tiene tres sub-objetos opcionales: `webhook`, `email`, `telegram`. El procedure hace upsert solo de los campos del canal que llega.

Se añade `configuracionRouter` al `appRouter` en `src/server/routers/_app.ts`.

---

## UI

### `src/components/dashboard/ConfiguracionNotificaciones.tsx`

Client Component. Tres secciones expandibles (una por canal), cada una con:

- Toggle habilitado/deshabilitado
- Campos específicos del canal (visibles solo si habilitado)
- Botón "Guardar" que llama a la Server Action correspondiente

### `src/app/(panel)/actions.ts`

Tres nuevas Server Actions:

```typescript
guardarWebhookAction(habilitado: boolean, url: string | undefined)
guardarEmailAction(habilitado: boolean, config: EmailConfig | undefined)
guardarTelegramAction(habilitado: boolean, botToken: string | undefined, chatId: string | undefined)
```

### `/configuracion` page

La página existente recibe una nueva sección "Notificaciones" que monta `ConfiguracionNotificaciones` con los datos iniciales cargados desde `api.configuracion.obtener()`.

---

## Testing

### Core — 100%

**`src/lib/notificaciones/webhook.test.ts`**

- Hace POST al URL con el payload correcto
- No lanza si fetch falla

**`src/lib/notificaciones/email.test.ts`**

- Llama a nodemailer con los parámetros SMTP correctos
- El asunto incluye resultado y nombre del proyecto
- No lanza si nodemailer falla

**`src/lib/notificaciones/telegram.test.ts`**

- Hace fetch a la API de Telegram con token y chatId correctos
- No lanza si fetch falla

**`src/lib/notificaciones/index.test.ts`**

- Solo llama a los canales habilitados
- Un canal fallido no cancela los otros (Promise.allSettled)
- Nunca lanza
- No hace nada si no existe la config en BD

**`src/server/routers/configuracion.test.ts`**

- `obtener`: devuelve config sin contraseña SMTP en claro
- `obtener`: devuelve null si no hay config
- `guardar` webhook: upsert correcto, campos email/telegram no se tocan
- `guardar` email: cifra la contraseña antes de guardar
- `guardar` telegram: upsert correcto
- Requiere autenticación

**`src/server/routers/proyectos.test.ts`** — añadir casos a `deploy` y `rollback`:

- Llama `enviarNotificacion` tras deploy exitoso
- Llama `enviarNotificacion` tras deploy fallido
- `enviarNotificacion` que falla no rompe el resultado del deploy

### Important — 80%

**`src/components/dashboard/ConfiguracionNotificaciones.test.tsx`**

- Muestra los tres paneles de canal
- Toggle webhook habilita/deshabilita el campo URL
- Toggle email habilita/deshabilita los campos SMTP
- Toggle telegram habilita/deshabilita token y chatId

### Infrastructure — 0%

`src/app/(panel)/configuracion/page.tsx` y actions — sin tests.

---

## Dependencias externas

- `nodemailer` — envío de email vía SMTP (añadir a `package.json`)
- API de Telegram — sin dependencia adicional, se usa `fetch` nativo

---

## Archivos afectados

| Acción | Fichero                                                         |
| ------ | --------------------------------------------------------------- |
| Editar | `prisma/schema.prisma`                                          |
| Crear  | `prisma/migrations/<timestamp>_add_configuracion_notificacion/` |
| Crear  | `src/lib/notificaciones/index.ts`                               |
| Crear  | `src/lib/notificaciones/index.test.ts`                          |
| Crear  | `src/lib/notificaciones/webhook.ts`                             |
| Crear  | `src/lib/notificaciones/webhook.test.ts`                        |
| Crear  | `src/lib/notificaciones/email.ts`                               |
| Crear  | `src/lib/notificaciones/email.test.ts`                          |
| Crear  | `src/lib/notificaciones/telegram.ts`                            |
| Crear  | `src/lib/notificaciones/telegram.test.ts`                       |
| Crear  | `src/server/routers/configuracion.ts`                           |
| Crear  | `src/server/routers/configuracion.test.ts`                      |
| Editar | `src/server/routers/_app.ts`                                    |
| Editar | `src/server/routers/proyectos.ts`                               |
| Editar | `src/server/routers/proyectos.test.ts`                          |
| Crear  | `src/components/dashboard/ConfiguracionNotificaciones.tsx`      |
| Crear  | `src/components/dashboard/ConfiguracionNotificaciones.test.tsx` |
| Editar | `src/app/(panel)/actions.ts`                                    |
| Editar | `src/app/(panel)/configuracion/page.tsx`                        |
| Editar | `src/app/api/webhook/route.ts`                                  |
