# Notificaciones de Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar notificaciones configurables (webhook, email, Telegram) cuando un deploy termina en éxito o error.

**Architecture:** Tabla `ConfiguracionNotificacion` en BD con configuración por canal. Módulo `src/lib/notificaciones/` con orquestador + tres adaptadores. El orquestador se llama fire-and-forget desde `proyectosRouter.deploy`, `proyectosRouter.rollback` y el webhook route. La UI en `/configuracion` permite activar/desactivar canales y guardar sus parámetros.

**Tech Stack:** Prisma, tRPC, nodemailer, Telegram Bot API (fetch nativo), Vitest, React (Client Component)

---

## File map

| Acción | Fichero                                                         |
| ------ | --------------------------------------------------------------- |
| Editar | `prisma/schema.prisma`                                          |
| Crear  | `src/lib/notificaciones/webhook.ts`                             |
| Crear  | `src/lib/notificaciones/webhook.test.ts`                        |
| Crear  | `src/lib/notificaciones/email.ts`                               |
| Crear  | `src/lib/notificaciones/email.test.ts`                          |
| Crear  | `src/lib/notificaciones/telegram.ts`                            |
| Crear  | `src/lib/notificaciones/telegram.test.ts`                       |
| Crear  | `src/lib/notificaciones/index.ts`                               |
| Crear  | `src/lib/notificaciones/index.test.ts`                          |
| Crear  | `src/server/routers/configuracion.ts`                           |
| Crear  | `src/server/routers/configuracion.test.ts`                      |
| Editar | `src/server/routers/_app.ts`                                    |
| Editar | `src/server/routers/proyectos.ts`                               |
| Editar | `src/server/routers/proyectos.test.ts`                          |
| Editar | `src/app/api/webhooks/github/route.ts`                          |
| Crear  | `src/components/dashboard/ConfiguracionNotificaciones.tsx`      |
| Crear  | `src/components/dashboard/ConfiguracionNotificaciones.test.tsx` |
| Editar | `src/app/(panel)/actions.ts`                                    |
| Editar | `src/app/(panel)/configuracion/page.tsx`                        |

---

### Task 1: Schema — modelo ConfiguracionNotificacion + migración

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Añadir el modelo al schema**

En `prisma/schema.prisma`, añade al final del archivo:

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

- [ ] **Step 2: Ejecutar migración**

```bash
npx prisma migrate dev --name add_configuracion_notificacion
```

Expected: migración creada y aplicada sin errores.

- [ ] **Step 3: Regenerar Prisma Client**

```bash
npx prisma generate
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: modelo ConfiguracionNotificacion en schema"
```

---

### Task 2: src/lib/notificaciones/webhook.ts (TDD)

**Files:**

- Create: `src/lib/notificaciones/webhook.test.ts`
- Create: `src/lib/notificaciones/webhook.ts`

- [ ] **Step 1: Escribir los tests de webhook.ts**

Crea `src/lib/notificaciones/webhook.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { enviarWebhook } from "./webhook";

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "exito" as const,
  output: "Build completado",
};

describe("enviarWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hace POST al URL con el payload completo como JSON", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await enviarWebhook("https://hooks.ejemplo.com/notify", payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.ejemplo.com/notify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
  });

  it("no lanza si fetch falla", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      enviarWebhook("https://hooks.ejemplo.com/notify", payload),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/notificaciones/webhook.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar src/lib/notificaciones/webhook.ts**

Crea `src/lib/notificaciones/webhook.ts`:

```typescript
import type { PayloadNotificacion } from "./index";

export async function enviarWebhook(
  url: string,
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // absorb
  }
}
```

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/notificaciones/webhook.test.ts
```

Expected: 2 tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/webhook.ts src/lib/notificaciones/webhook.test.ts
git commit -m "feat: enviarWebhook — notificación por POST a URL configurada"
```

---

### Task 3: src/lib/notificaciones/email.ts + nodemailer (TDD)

**Files:**

- Create: `src/lib/notificaciones/email.test.ts`
- Create: `src/lib/notificaciones/email.ts`

- [ ] **Step 1: Instalar nodemailer**

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Escribir los tests de email.ts**

Crea `src/lib/notificaciones/email.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateTransport, mockSendMail } = vi.hoisted(() => ({
  mockCreateTransport: vi.fn(),
  mockSendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

import { enviarEmail } from "./email";

const smtpConfig = {
  smtpHost: "smtp.ejemplo.com",
  smtpPort: 587,
  smtpUser: "user@ejemplo.com",
  smtpPass: "supersecret",
  remitente: "panel@vicalba.com",
  destinatario: "admin@cliente.com",
};

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "exito" as const,
  output: Array.from({ length: 60 }, (_, i) => `Línea ${i + 1}`).join("\n"),
};

describe("enviarEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({});
  });

  it("crea transporte nodemailer con los parámetros SMTP correctos", async () => {
    await enviarEmail(smtpConfig, payload);

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.ejemplo.com",
      port: 587,
      auth: { user: "user@ejemplo.com", pass: "supersecret" },
    });
  });

  it("incluye resultado y nombre del proyecto en el asunto", async () => {
    await enviarEmail(smtpConfig, payload);

    const mailOptions = mockSendMail.mock.calls[0][0] as {
      subject: string;
      text: string;
    };
    expect(mailOptions.subject).toContain("exito");
    expect(mailOptions.subject).toContain("web-app");
  });

  it("trunca el output a las últimas 50 líneas en el cuerpo", async () => {
    await enviarEmail(smtpConfig, payload);

    const mailOptions = mockSendMail.mock.calls[0][0] as { text: string };
    expect(mailOptions.text).toContain("Línea 60");
    expect(mailOptions.text).not.toContain("Línea 10");
  });

  it("no lanza si nodemailer falla", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP error"));

    await expect(enviarEmail(smtpConfig, payload)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/notificaciones/email.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 4: Implementar src/lib/notificaciones/email.ts**

Crea `src/lib/notificaciones/email.ts`:

```typescript
import nodemailer from "nodemailer";
import type { PayloadNotificacion } from "./index";

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
): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    const lineas = payload.output.split("\n");
    const outputTruncado = lineas.slice(-50).join("\n");

    await transporter.sendMail({
      from: config.remitente,
      to: config.destinatario,
      subject: `[vicalba] Deploy ${payload.resultado} — ${payload.proyectoNombre}`,
      text: [
        `Proyecto: ${payload.proyectoNombre}`,
        `Cliente: ${payload.clienteSlug}`,
        `Rama: ${payload.rama}`,
        `SHA: ${payload.sha ?? "—"}`,
        `Resultado: ${payload.resultado}`,
        "",
        "Output (últimas 50 líneas):",
        outputTruncado,
      ].join("\n"),
    });
  } catch {
    // absorb
  }
}
```

- [ ] **Step 5: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/notificaciones/email.test.ts
```

Expected: 4 tests pasan.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notificaciones/email.ts src/lib/notificaciones/email.test.ts package.json package-lock.json
git commit -m "feat: enviarEmail — notificación via SMTP con nodemailer"
```

---

### Task 4: src/lib/notificaciones/telegram.ts (TDD)

**Files:**

- Create: `src/lib/notificaciones/telegram.test.ts`
- Create: `src/lib/notificaciones/telegram.ts`

- [ ] **Step 1: Escribir los tests de telegram.ts**

Crea `src/lib/notificaciones/telegram.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { enviarTelegram } from "./telegram";

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123",
  resultado: "error" as const,
  output: Array.from({ length: 30 }, (_, i) => `Línea ${i + 1}`).join("\n"),
};

describe("enviarTelegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  });

  it("hace fetch a la API de Telegram con el token y chatId correctos", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.telegram.org/botbot-token-123/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("chat-456"),
      }),
    );
  });

  it("incluye resultado, proyecto y rama en el mensaje", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { chat_id: string; text: string };
    expect(body.text).toContain("error");
    expect(body.text).toContain("web-app");
    expect(body.text).toContain("main");
  });

  it("trunca el output a las últimas 20 líneas", async () => {
    await enviarTelegram("bot-token-123", "chat-456", payload);

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    ) as { text: string };
    expect(body.text).toContain("Línea 30");
    expect(body.text).not.toContain("Línea 10");
  });

  it("no lanza si fetch falla", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    await expect(
      enviarTelegram("bot-token-123", "chat-456", payload),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/notificaciones/telegram.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar src/lib/notificaciones/telegram.ts**

Crea `src/lib/notificaciones/telegram.ts`:

````typescript
import type { PayloadNotificacion } from "./index";

export async function enviarTelegram(
  botToken: string,
  chatId: string,
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const lineas = payload.output.split("\n");
    const outputTruncado = lineas.slice(-20).join("\n");

    const emoji = payload.resultado === "exito" ? "✅" : "❌";
    const text = [
      `${emoji} *Deploy ${payload.resultado}* — ${payload.proyectoNombre}`,
      `Rama: \`${payload.rama}\``,
      `SHA: \`${payload.sha ?? "—"}\``,
      "",
      "```",
      outputTruncado,
      "```",
    ].join("\n");

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {
    // absorb
  }
}
````

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/notificaciones/telegram.test.ts
```

Expected: 4 tests pasan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notificaciones/telegram.ts src/lib/notificaciones/telegram.test.ts
git commit -m "feat: enviarTelegram — notificación via Telegram Bot API"
```

---

### Task 5: src/lib/notificaciones/index.ts — orquestador (TDD)

**Files:**

- Create: `src/lib/notificaciones/index.test.ts`
- Create: `src/lib/notificaciones/index.ts`

- [ ] **Step 1: Escribir los tests del orquestador**

Crea `src/lib/notificaciones/index.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindUnique,
  mockEnviarWebhook,
  mockEnviarEmail,
  mockEnviarTelegram,
  mockDescifrar,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockEnviarWebhook: vi.fn().mockResolvedValue(undefined),
  mockEnviarEmail: vi.fn().mockResolvedValue(undefined),
  mockEnviarTelegram: vi.fn().mockResolvedValue(undefined),
  mockDescifrar: vi.fn().mockReturnValue("plainpass"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionNotificacion: { findUnique: mockFindUnique },
  },
}));
vi.mock("./webhook", () => ({ enviarWebhook: mockEnviarWebhook }));
vi.mock("./email", () => ({ enviarEmail: mockEnviarEmail }));
vi.mock("./telegram", () => ({ enviarTelegram: mockEnviarTelegram }));
vi.mock("@/lib/crypto", () => ({ descifrar: mockDescifrar }));

import { enviarNotificacion } from "./index";

const configBase = {
  id: "default",
  webhookHabilitado: false,
  webhookUrl: null,
  emailHabilitado: false,
  emailSmtpHost: null,
  emailSmtpPort: null,
  emailSmtpUser: null,
  emailSmtpPass: null,
  emailSmtpPassIv: null,
  emailSmtpPassTag: null,
  emailRemitente: null,
  emailDestinatario: null,
  telegramHabilitado: false,
  telegramBotToken: null,
  telegramChatId: null,
};

const payload = {
  proyectoNombre: "web-app",
  clienteSlug: "acme",
  rama: "main",
  sha: "abc123" as string | null,
  resultado: "exito" as const,
  output: "Build OK",
};

describe("enviarNotificacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarWebhook.mockResolvedValue(undefined);
    mockEnviarEmail.mockResolvedValue(undefined);
    mockEnviarTelegram.mockResolvedValue(undefined);
    mockDescifrar.mockReturnValue("plainpass");
  });

  it("no hace nada si no existe config en BD", async () => {
    mockFindUnique.mockResolvedValue(null);

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).not.toHaveBeenCalled();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockEnviarTelegram).not.toHaveBeenCalled();
  });

  it("solo llama a los canales habilitados", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
      telegramHabilitado: false,
    });

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).toHaveBeenCalledOnce();
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockEnviarTelegram).not.toHaveBeenCalled();
  });

  it("un canal fallido no cancela los otros (Promise.allSettled)", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
      telegramHabilitado: true,
      telegramBotToken: "token",
      telegramChatId: "chat",
    });
    mockEnviarWebhook.mockRejectedValue(new Error("webhook falló"));

    await enviarNotificacion(payload);

    expect(mockEnviarWebhook).toHaveBeenCalledOnce();
    expect(mockEnviarTelegram).toHaveBeenCalledOnce();
  });

  it("nunca lanza aunque todos los canales fallen", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      webhookHabilitado: true,
      webhookUrl: "https://hooks.ejemplo.com/notify",
    });
    mockEnviarWebhook.mockRejectedValue(new Error("fallo total"));

    await expect(enviarNotificacion(payload)).resolves.not.toThrow();
  });

  it("descifra la contraseña SMTP antes de llamar a enviarEmail", async () => {
    mockFindUnique.mockResolvedValue({
      ...configBase,
      emailHabilitado: true,
      emailSmtpHost: "smtp.ejemplo.com",
      emailSmtpPort: 587,
      emailSmtpUser: "user@ejemplo.com",
      emailSmtpPass: "enc",
      emailSmtpPassIv: "iv",
      emailSmtpPassTag: "tag",
      emailRemitente: "panel@vicalba.com",
      emailDestinatario: "admin@cliente.com",
    });

    await enviarNotificacion(payload);

    expect(mockDescifrar).toHaveBeenCalledWith("enc", "iv", "tag");
    expect(mockEnviarEmail).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPass: "plainpass" }),
      payload,
    );
  });
});
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/lib/notificaciones/index.test.ts
```

Expected: FAIL — módulo no existe.

- [ ] **Step 3: Crear src/lib/notificaciones/index.ts**

Crea `src/lib/notificaciones/index.ts`:

```typescript
import { descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { enviarEmail } from "./email";
import { enviarTelegram } from "./telegram";
import { enviarWebhook } from "./webhook";

export interface PayloadNotificacion {
  proyectoNombre: string;
  clienteSlug: string;
  rama: string;
  sha: string | null;
  resultado: "exito" | "error";
  output: string;
}

export async function enviarNotificacion(
  payload: PayloadNotificacion,
): Promise<void> {
  try {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return;

    const promesas: Promise<void>[] = [];

    if (config.webhookHabilitado && config.webhookUrl) {
      promesas.push(enviarWebhook(config.webhookUrl, payload));
    }

    if (
      config.emailHabilitado &&
      config.emailSmtpHost &&
      config.emailSmtpPort &&
      config.emailSmtpUser &&
      config.emailSmtpPass &&
      config.emailSmtpPassIv &&
      config.emailSmtpPassTag &&
      config.emailRemitente &&
      config.emailDestinatario
    ) {
      const smtpPass = descifrar(
        config.emailSmtpPass,
        config.emailSmtpPassIv,
        config.emailSmtpPassTag,
      );
      promesas.push(
        enviarEmail(
          {
            smtpHost: config.emailSmtpHost,
            smtpPort: config.emailSmtpPort,
            smtpUser: config.emailSmtpUser,
            smtpPass,
            remitente: config.emailRemitente,
            destinatario: config.emailDestinatario,
          },
          payload,
        ),
      );
    }

    if (
      config.telegramHabilitado &&
      config.telegramBotToken &&
      config.telegramChatId
    ) {
      promesas.push(
        enviarTelegram(config.telegramBotToken, config.telegramChatId, payload),
      );
    }

    await Promise.allSettled(promesas);
  } catch {
    // absorb
  }
}
```

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/lib/notificaciones/index.test.ts
```

Expected: 5 tests pasan.

- [ ] **Step 5: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notificaciones/index.ts src/lib/notificaciones/index.test.ts
git commit -m "feat: enviarNotificacion — orquestador con Promise.allSettled"
```

---

### Task 6: configuracionRouter + registro en \_app.ts (TDD)

**Files:**

- Create: `src/server/routers/configuracion.test.ts`
- Create: `src/server/routers/configuracion.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Registrar el router en \_app.ts**

Edita `src/server/routers/_app.ts`:

```typescript
import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { configuracionRouter } from "./configuracion";
import { proyectosRouter } from "./proyectos";
import { variablesRouter } from "./variables";

export const appRouter = router({
  clientes: clientesRouter,
  configuracion: configuracionRouter,
  proyectos: proyectosRouter,
  variables: variablesRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 2: Crear un stub mínimo de configuracion.ts para que el import compile**

Crea `src/server/routers/configuracion.ts`:

```typescript
import { router } from "@/server/trpc";

export const configuracionRouter = router({});
```

- [ ] **Step 3: Escribir los tests del router**

Crea `src/server/routers/configuracion.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockUpsert, mockCifrar } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpsert: vi.fn(),
  mockCifrar: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    configuracionNotificacion: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/crypto", () => ({
  cifrar: mockCifrar,
}));

import { auth } from "@/lib/auth";
import { createCallerFactory, createContext } from "@/server/trpc";
import { appRouter } from "@/server/routers/_app";

const createCaller = createCallerFactory(appRouter);

const mockSession = {
  user: { id: "u1", email: "admin@vicalba.local", name: "Admin" },
  expires: "2099-01-01",
};

const configBD = {
  id: "default",
  webhookHabilitado: true,
  webhookUrl: "https://hooks.ejemplo.com",
  emailHabilitado: false,
  emailSmtpHost: null,
  emailSmtpPort: null,
  emailSmtpUser: null,
  emailSmtpPass: "enc-pass",
  emailSmtpPassIv: "iv",
  emailSmtpPassTag: "tag",
  emailRemitente: null,
  emailDestinatario: null,
  telegramHabilitado: false,
  telegramBotToken: null,
  telegramChatId: null,
};

describe("configuracion.obtener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
  });

  it("devuelve la config sin emailSmtpPass en claro", async () => {
    mockFindUnique.mockResolvedValue(configBD);

    const ctx = await createContext();
    const result = await createCaller(ctx).configuracion.obtener();

    expect(result).not.toBeNull();
    expect((result as { emailSmtpPass: unknown }).emailSmtpPass).toBeNull();
    expect((result as { webhookUrl: unknown }).webhookUrl).toBe(
      "https://hooks.ejemplo.com",
    );
  });

  it("devuelve null si no hay config en BD", async () => {
    mockFindUnique.mockResolvedValue(null);

    const ctx = await createContext();
    const result = await createCaller(ctx).configuracion.obtener();

    expect(result).toBeNull();
  });

  it("requiere autenticación", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const ctx = await createContext();
    await expect(
      createCaller(ctx).configuracion.obtener(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("configuracion.guardar — webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
  });

  it("hace upsert con los campos webhook correctos", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      webhook: { habilitado: true, url: "https://hooks.nuevo.com" },
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "default" },
        update: expect.objectContaining({
          webhookHabilitado: true,
          webhookUrl: "https://hooks.nuevo.com",
        }),
      }),
    );
  });

  it("no toca campos de email ni telegram al guardar solo webhook", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      webhook: { habilitado: false, url: undefined },
    });

    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(Object.keys(updateArg.update)).not.toContain("emailHabilitado");
    expect(Object.keys(updateArg.update)).not.toContain("telegramHabilitado");
  });
});

describe("configuracion.guardar — email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
    mockCifrar.mockReturnValue({
      valorCifrado: "enc",
      iv: "iv123",
      authTag: "tag123",
    });
  });

  it("cifra la contraseña SMTP antes de guardar", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      email: {
        habilitado: true,
        smtpHost: "smtp.ejemplo.com",
        smtpPort: 587,
        smtpUser: "user@ejemplo.com",
        smtpPass: "mysecretpass",
        remitente: "panel@vicalba.com",
        destinatario: "admin@cliente.com",
      },
    });

    expect(mockCifrar).toHaveBeenCalledWith("mysecretpass");
    const updateArg = mockUpsert.mock.calls[0][0] as {
      update: Record<string, unknown>;
    };
    expect(updateArg.update.emailSmtpPass).toBe("enc");
    expect(updateArg.update.emailSmtpPassIv).toBe("iv123");
    expect(updateArg.update.emailSmtpPassTag).toBe("tag123");
  });
});

describe("configuracion.guardar — telegram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    mockUpsert.mockResolvedValue(configBD);
  });

  it("hace upsert con los campos telegram correctos", async () => {
    const ctx = await createContext();
    await createCaller(ctx).configuracion.guardar({
      telegram: {
        habilitado: true,
        botToken: "bot-token-xyz",
        chatId: "chat-123",
      },
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          telegramHabilitado: true,
          telegramBotToken: "bot-token-xyz",
          telegramChatId: "chat-123",
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/server/routers/configuracion.test.ts
```

Expected: FAIL — procedimientos no implementados.

- [ ] **Step 5: Implementar configuracion.ts completo**

Reemplaza el contenido de `src/server/routers/configuracion.ts`:

```typescript
import { cifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";
import { z } from "zod";

const guardarInput = z.object({
  webhook: z
    .object({
      habilitado: z.boolean(),
      url: z.string().url().optional(),
    })
    .optional(),
  email: z
    .object({
      habilitado: z.boolean(),
      smtpHost: z.string().optional(),
      smtpPort: z.number().int().positive().optional(),
      smtpUser: z.string().optional(),
      smtpPass: z.string().optional(),
      remitente: z.string().optional(),
      destinatario: z.string().optional(),
    })
    .optional(),
  telegram: z
    .object({
      habilitado: z.boolean(),
      botToken: z.string().optional(),
      chatId: z.string().optional(),
    })
    .optional(),
});

export const configuracionRouter = router({
  obtener: protectedProcedure.query(async () => {
    const config = await prisma.configuracionNotificacion.findUnique({
      where: { id: "default" },
    });
    if (!config) return null;
    return { ...config, emailSmtpPass: null };
  }),

  guardar: protectedProcedure
    .input(guardarInput)
    .mutation(async ({ input }) => {
      const data: Record<string, unknown> = {};

      if (input.webhook !== undefined) {
        data.webhookHabilitado = input.webhook.habilitado;
        data.webhookUrl = input.webhook.url ?? null;
      }

      if (input.email !== undefined) {
        data.emailHabilitado = input.email.habilitado;
        data.emailSmtpHost = input.email.smtpHost ?? null;
        data.emailSmtpPort = input.email.smtpPort ?? null;
        data.emailSmtpUser = input.email.smtpUser ?? null;
        data.emailRemitente = input.email.remitente ?? null;
        data.emailDestinatario = input.email.destinatario ?? null;
        if (input.email.smtpPass) {
          const { valorCifrado, iv, authTag } = cifrar(input.email.smtpPass);
          data.emailSmtpPass = valorCifrado;
          data.emailSmtpPassIv = iv;
          data.emailSmtpPassTag = authTag;
        }
      }

      if (input.telegram !== undefined) {
        data.telegramHabilitado = input.telegram.habilitado;
        data.telegramBotToken = input.telegram.botToken ?? null;
        data.telegramChatId = input.telegram.chatId ?? null;
      }

      await prisma.configuracionNotificacion.upsert({
        where: { id: "default" },
        create: { id: "default", ...data },
        update: data,
      });
    }),
});
```

- [ ] **Step 6: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/server/routers/configuracion.test.ts
```

Expected: 7 tests pasan.

- [ ] **Step 7: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/server/routers/configuracion.ts src/server/routers/configuracion.test.ts src/server/routers/_app.ts
git commit -m "feat: configuracionRouter — obtener y guardar configuración de notificaciones"
```

---

### Task 7: Integración de enviarNotificacion en callers (TDD)

**Files:**

- Modify: `src/server/routers/proyectos.test.ts`
- Modify: `src/server/routers/proyectos.ts`
- Modify: `src/app/api/webhooks/github/route.ts`

- [ ] **Step 1: Añadir mock de enviarNotificacion en proyectos.test.ts**

En `src/server/routers/proyectos.test.ts`, añade el mock junto al resto de los `vi.mock`:

```typescript
vi.mock("@/lib/notificaciones", () => ({
  enviarNotificacion: vi.fn().mockResolvedValue(undefined),
}));
```

Añade el import correspondiente:

```typescript
import { enviarNotificacion } from "@/lib/notificaciones";
```

- [ ] **Step 2: Añadir tests de notificaciones para deploy**

Al final del fichero `src/server/routers/proyectos.test.ts`, añade:

```typescript
describe("proyectos.deploy — notificaciones", () => {
  const mockProyectoParaDeploy = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "stopped" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/repo",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
    servicios: [
      {
        id: "s1",
        nombre: "nginx",
        estado: "stopped" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoParaDeploy as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue(
      mockProyectoParaDeploy as never,
    );
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    vi.mocked(enviarNotificacion).mockResolvedValue(undefined);
  });

  it("llama enviarNotificacion tras deploy exitoso", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "Build OK",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoNombre: "web-app",
        clienteSlug: "cliente-uno",
        rama: "main",
        resultado: "exito",
        output: "Build OK",
      }),
    );
  });

  it("llama enviarNotificacion tras deploy fallido", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "Build failed",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.deploy({ id: "p1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "error", output: "Build failed" }),
    );
  });

  it("enviarNotificacion que falla no rompe el resultado del deploy", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "ok",
    });
    vi.mocked(enviarNotificacion).mockRejectedValue(new Error("notif falló"));

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.deploy({ id: "p1" }),
    ).resolves.toBeDefined();
  });
});

describe("proyectos.rollback — notificaciones", () => {
  const mockDeploy = {
    id: "d1",
    proyectoId: "p1",
    rama: "main",
    sha: "deadbeef",
    resultado: "exito" as const,
    output: "prev build",
    iniciadoEn: new Date(),
    finalizadoEn: new Date(),
  };

  const mockProyectoParaRollback = {
    id: "p1",
    nombre: "web-app",
    clienteId: "c1",
    estado: "running" as const,
    dominio: null,
    repositorioUrl: "https://github.com/org/repo",
    rama: "main",
    autoDeployHabilitado: false,
    ultimoDeployEn: null,
    ultimoDeployRama: null,
    creadoEn: new Date(),
    actualizadoEn: new Date(),
    cliente: {
      id: "c1",
      slug: "cliente-uno",
      nombre: "Cliente Uno",
      creadoEn: new Date(),
    },
    servicios: [
      {
        id: "s1",
        nombre: "nginx",
        estado: "running" as const,
        proyectoId: "p1",
        creadoEn: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(prisma.deploy.findUnique).mockResolvedValue(mockDeploy as never);
    vi.mocked(prisma.proyecto.findUnique).mockResolvedValue(
      mockProyectoParaRollback as never,
    );
    vi.mocked(prisma.proyecto.update).mockResolvedValue(
      mockProyectoParaRollback as never,
    );
    vi.mocked(prisma.variableEntorno.findMany).mockResolvedValue([]);
    vi.mocked(enviarNotificacion).mockResolvedValue(undefined);
  });

  it("llama enviarNotificacion tras rollback exitoso con el sha correcto", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "Rollback OK",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({
        proyectoNombre: "web-app",
        sha: "deadbeef",
        resultado: "exito",
        output: "Rollback OK",
      }),
    );
  });

  it("llama enviarNotificacion tras rollback fallido", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "error",
      output: "Rollback failed",
    });

    const ctx = await createContext();
    await createCaller(ctx).proyectos.rollback({ deployId: "d1" });

    expect(enviarNotificacion).toHaveBeenCalledWith(
      expect.objectContaining({ resultado: "error" }),
    );
  });

  it("enviarNotificacion que falla no rompe el resultado del rollback", async () => {
    vi.mocked(ejecutarDeploy).mockResolvedValue({
      resultado: "exito",
      output: "ok",
    });
    vi.mocked(enviarNotificacion).mockRejectedValue(new Error("notif falló"));

    const ctx = await createContext();
    await expect(
      createCaller(ctx).proyectos.rollback({ deployId: "d1" }),
    ).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Ejecutar los tests para verificar que FALLAN (red)**

```bash
npx vitest run src/server/routers/proyectos.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL en los tests de notificaciones.

- [ ] **Step 4: Actualizar proyectos.ts — imports + procedure deploy**

En `src/server/routers/proyectos.ts`, añade el import:

```typescript
import { enviarNotificacion } from "@/lib/notificaciones";
```

En el procedure `deploy`, cambia `const { resultado } = await ejecutarDeploy(...)` por `const { resultado, output } = await ejecutarDeploy(...)` y añade la notificación:

```typescript
const { resultado, output } = await ejecutarDeploy({
  proyectoId: input.id,
  repoUrl: proyecto.repositorioUrl,
  rama: proyecto.rama,
  clienteSlug: proyecto.cliente.slug,
  proyectoNombre: proyecto.nombre,
  servicios: proyecto.servicios.map((s) => s.nombre),
  variables,
});

enviarNotificacion({
  proyectoNombre: proyecto.nombre,
  clienteSlug: proyecto.cliente.slug,
  rama: proyecto.rama,
  sha: null,
  resultado,
  output,
}).catch(() => {});

return prisma.proyecto.update({
  where: { id: input.id },
  data: {
    estado: resultado === "exito" ? "running" : "error",
    ...(resultado === "exito"
      ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
      : {}),
  },
});
```

- [ ] **Step 5: Actualizar proyectos.ts — procedure rollback**

En el procedure `rollback`, cambia `const { resultado } = await ejecutarDeploy(...)` por `const { resultado, output } = await ejecutarDeploy(...)` y añade la notificación:

```typescript
const { resultado, output } = await ejecutarDeploy({
  proyectoId: deploy.proyectoId,
  repoUrl: proyecto.repositorioUrl!,
  rama: deploy.rama,
  sha: deploy.sha,
  clienteSlug: proyecto.cliente.slug,
  proyectoNombre: proyecto.nombre,
  servicios: proyecto.servicios.map((s) => s.nombre),
  variables,
});

enviarNotificacion({
  proyectoNombre: proyecto.nombre,
  clienteSlug: proyecto.cliente.slug,
  rama: deploy.rama,
  sha: deploy.sha ?? null,
  resultado,
  output,
}).catch(() => {});

return prisma.proyecto.update({
  where: { id: deploy.proyectoId },
  data: {
    estado: resultado === "exito" ? "running" : "error",
    ...(resultado === "exito"
      ? { ultimoDeployEn: new Date(), ultimoDeployRama: deploy.rama }
      : {}),
  },
});
```

- [ ] **Step 6: Actualizar webhook route**

En `src/app/api/webhooks/github/route.ts`, añade el import:

```typescript
import { enviarNotificacion } from "@/lib/notificaciones";
```

Cambia `const { resultado } = await ejecutarDeploy(...)` por `const { resultado, output } = await ejecutarDeploy(...)` y añade la notificación después del segundo `prisma.proyecto.update`:

```typescript
const { resultado, output } = await ejecutarDeploy({
  proyectoId: proyecto.id,
  repoUrl: proyecto.repositorioUrl!,
  rama: proyecto.rama,
  clienteSlug: proyecto.cliente.slug,
  proyectoNombre: proyecto.nombre,
  servicios: proyecto.servicios.map((s) => s.nombre),
});

await prisma.proyecto.update({
  where: { id: proyecto.id },
  data: {
    estado: resultado === "exito" ? "running" : "error",
    ...(resultado === "exito"
      ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
      : {}),
  },
});

enviarNotificacion({
  proyectoNombre: proyecto.nombre,
  clienteSlug: proyecto.cliente.slug,
  rama: proyecto.rama,
  sha: null,
  resultado,
  output,
}).catch(() => {});

return NextResponse.json({ ok: true, deployed: proyecto.id });
```

- [ ] **Step 7: Ejecutar todos los tests para verificar que PASAN (verde)**

```bash
npx vitest run src/server/routers/proyectos.test.ts
```

Expected: todos los tests pasan incluyendo los 6 nuevos de notificaciones.

- [ ] **Step 8: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/server/routers/proyectos.ts src/server/routers/proyectos.test.ts "src/app/api/webhooks/github/route.ts"
git commit -m "feat: enviarNotificacion fire-and-forget en deploy, rollback y webhook"
```

---

### Task 8: UI — ConfiguracionNotificaciones + Server Actions + page.tsx

**Files:**

- Create: `src/components/dashboard/ConfiguracionNotificaciones.test.tsx`
- Create: `src/components/dashboard/ConfiguracionNotificaciones.tsx`
- Modify: `src/app/(panel)/actions.ts`
- Modify: `src/app/(panel)/configuracion/page.tsx`

- [ ] **Step 1: Escribir los tests del componente**

Crea `src/components/dashboard/ConfiguracionNotificaciones.test.tsx`:

```typescript
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfiguracionNotificaciones } from "./ConfiguracionNotificaciones";

vi.mock("@/app/(panel)/actions", () => ({
  guardarWebhookAction: vi.fn().mockResolvedValue(undefined),
  guardarEmailAction: vi.fn().mockResolvedValue(undefined),
  guardarTelegramAction: vi.fn().mockResolvedValue(undefined),
}));

describe("ConfiguracionNotificaciones", () => {
  it("muestra los tres paneles de canal", () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.getByText(/webhook/i)).toBeInTheDocument();
    expect(screen.getByText(/email/i)).toBeInTheDocument();
    expect(screen.getByText(/telegram/i)).toBeInTheDocument();
  });

  it("toggle webhook habilita y muestra el campo URL", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/url del webhook/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /habilitar webhook/i });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/url del webhook/i)).toBeInTheDocument();
  });

  it("toggle email habilita y muestra los campos SMTP", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/smtp host/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /habilitar email/i });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/smtp host/i)).toBeInTheDocument();
  });

  it("toggle telegram habilita y muestra token y chatId", async () => {
    render(<ConfiguracionNotificaciones config={null} />);

    expect(screen.queryByLabelText(/bot token/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("checkbox", { name: /habilitar telegram/i });
    await userEvent.click(toggle);

    expect(screen.getByLabelText(/bot token/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/chat id/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar tests para verificar que FALLAN (red)**

```bash
npx vitest run src/components/dashboard/ConfiguracionNotificaciones.test.tsx
```

Expected: FAIL — componente no existe.

- [ ] **Step 3: Crear ConfiguracionNotificaciones.tsx**

Crea `src/components/dashboard/ConfiguracionNotificaciones.tsx`:

```tsx
"use client";

import {
  guardarEmailAction,
  guardarTelegramAction,
  guardarWebhookAction,
} from "@/app/(panel)/actions";
import { useState, useTransition } from "react";

type ConfigData = {
  webhookHabilitado: boolean;
  webhookUrl: string | null;
  emailHabilitado: boolean;
  emailSmtpHost: string | null;
  emailSmtpPort: number | null;
  emailSmtpUser: string | null;
  emailRemitente: string | null;
  emailDestinatario: string | null;
  telegramHabilitado: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
} | null;

export function ConfiguracionNotificaciones({
  config,
}: {
  config: ConfigData;
}) {
  const [webhookHabilitado, setWebhookHabilitado] = useState(
    config?.webhookHabilitado ?? false,
  );
  const [webhookUrl, setWebhookUrl] = useState(config?.webhookUrl ?? "");

  const [emailHabilitado, setEmailHabilitado] = useState(
    config?.emailHabilitado ?? false,
  );
  const [smtpHost, setSmtpHost] = useState(config?.emailSmtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(
    String(config?.emailSmtpPort ?? 587),
  );
  const [smtpUser, setSmtpUser] = useState(config?.emailSmtpUser ?? "");
  const [smtpPass, setSmtpPass] = useState("");
  const [remitente, setRemitente] = useState(config?.emailRemitente ?? "");
  const [destinatario, setDestinatario] = useState(
    config?.emailDestinatario ?? "",
  );

  const [telegramHabilitado, setTelegramHabilitado] = useState(
    config?.telegramHabilitado ?? false,
  );
  const [botToken, setBotToken] = useState(config?.telegramBotToken ?? "");
  const [chatId, setChatId] = useState(config?.telegramChatId ?? "");

  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  const mostrarMensaje = (txt: string) => {
    setMensaje(txt);
    setTimeout(() => setMensaje(null), 3000);
  };

  return (
    <div className="flex flex-col gap-4">
      {mensaje && (
        <p className="font-body text-xs text-state-running">{mensaje}</p>
      )}

      {/* Webhook */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="webhook-toggle"
            type="checkbox"
            aria-label="Habilitar Webhook"
            checked={webhookHabilitado}
            onChange={(e) => setWebhookHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="webhook-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Webhook
          </label>
        </div>

        {webhookHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="webhook-url"
                className="font-body text-xs text-text-muted"
              >
                URL del Webhook
              </label>
              <input
                id="webhook-url"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.ejemplo.com/notify"
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
              />
            </div>
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarWebhookAction(
                webhookHabilitado,
                webhookUrl || undefined,
              );
              mostrarMensaje("Webhook guardado");
            })
          }
          disabled={isPending}
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar Webhook
        </button>
      </div>

      {/* Email */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="email-toggle"
            type="checkbox"
            aria-label="Habilitar Email"
            checked={emailHabilitado}
            onChange={(e) => setEmailHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="email-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Email
          </label>
        </div>

        {emailHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            {[
              {
                id: "smtp-host",
                label: "SMTP Host",
                value: smtpHost,
                setter: setSmtpHost,
                type: "text",
                placeholder: "smtp.ejemplo.com",
              },
              {
                id: "smtp-port",
                label: "SMTP Port",
                value: smtpPort,
                setter: setSmtpPort,
                type: "number",
                placeholder: "587",
              },
              {
                id: "smtp-user",
                label: "SMTP User",
                value: smtpUser,
                setter: setSmtpUser,
                type: "text",
                placeholder: "user@ejemplo.com",
              },
              {
                id: "smtp-pass",
                label: "SMTP Pass",
                value: smtpPass,
                setter: setSmtpPass,
                type: "password",
                placeholder: "••••••",
              },
              {
                id: "email-remitente",
                label: "Remitente",
                value: remitente,
                setter: setRemitente,
                type: "email",
                placeholder: "panel@vicalba.com",
              },
              {
                id: "email-destinatario",
                label: "Destinatario",
                value: destinatario,
                setter: setDestinatario,
                type: "email",
                placeholder: "admin@cliente.com",
              },
            ].map(({ id, label, value, setter, type, placeholder }) => (
              <div key={id} className="flex flex-col gap-1">
                <label
                  htmlFor={id}
                  className="font-body text-xs text-text-muted"
                >
                  {label}
                </label>
                <input
                  id={id}
                  type={type}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
                />
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarEmailAction(emailHabilitado, {
                smtpHost: smtpHost || undefined,
                smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
                smtpUser: smtpUser || undefined,
                smtpPass: smtpPass || undefined,
                remitente: remitente || undefined,
                destinatario: destinatario || undefined,
              });
              mostrarMensaje("Email guardado");
            })
          }
          disabled={isPending}
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar Email
        </button>
      </div>

      {/* Telegram */}
      <div className="border border-border rounded-[var(--radius-md)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            id="telegram-toggle"
            type="checkbox"
            aria-label="Habilitar Telegram"
            checked={telegramHabilitado}
            onChange={(e) => setTelegramHabilitado(e.target.checked)}
            className="cursor-pointer"
          />
          <label
            htmlFor="telegram-toggle"
            className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest cursor-pointer"
          >
            Telegram
          </label>
        </div>

        {telegramHabilitado && (
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="telegram-token"
                className="font-body text-xs text-text-muted"
              >
                Bot Token
              </label>
              <input
                id="telegram-token"
                type="text"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="telegram-chat"
                className="font-body text-xs text-text-muted"
              >
                Chat ID
              </label>
              <input
                id="telegram-chat"
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                className="font-body text-sm text-text-primary bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1"
              />
            </div>
          </div>
        )}

        <button
          onClick={() =>
            startTransition(async () => {
              await guardarTelegramAction(
                telegramHabilitado,
                botToken || undefined,
                chatId || undefined,
              );
              mostrarMensaje("Telegram guardado");
            })
          }
          disabled={isPending}
          className="font-body text-xs text-text-primary bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-1 hover:bg-background disabled:opacity-50"
        >
          Guardar Telegram
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar tests para verificar que PASAN (verde)**

```bash
npx vitest run src/components/dashboard/ConfiguracionNotificaciones.test.tsx
```

Expected: 4 tests pasan.

- [ ] **Step 5: Añadir las tres Server Actions a actions.ts**

En `src/app/(panel)/actions.ts`, añade al final:

```typescript
export async function guardarWebhookAction(
  habilitado: boolean,
  url: string | undefined,
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({ webhook: { habilitado, url } });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al guardar webhook",
    };
  }
}

export async function guardarEmailAction(
  habilitado: boolean,
  config?: {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    remitente?: string;
    destinatario?: string;
  },
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({
      email: { habilitado, ...config },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al guardar email",
    };
  }
}

export async function guardarTelegramAction(
  habilitado: boolean,
  botToken: string | undefined,
  chatId: string | undefined,
) {
  try {
    const api = await createServerCaller();
    await api.configuracion.guardar({
      telegram: { habilitado, botToken, chatId },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Error al guardar Telegram",
    };
  }
}
```

- [ ] **Step 6: Actualizar configuracion/page.tsx para añadir la sección Notificaciones**

Edita `src/app/(panel)/configuracion/page.tsx`. Añade los imports:

```typescript
import { createServerCaller } from "@/server/caller";
import { ConfiguracionNotificaciones } from "@/components/dashboard/ConfiguracionNotificaciones";
```

Y añade la sección Notificaciones al final del `<div className="flex flex-col gap-6">`:

```tsx
<Section titulo="Notificaciones">
  <p className="font-body text-xs text-text-muted mb-3">
    Configura alertas cuando un deploy termine en éxito o error.
  </p>
  <ConfiguracionNotificaciones config={config} />
</Section>
```

La función del componente de página necesita cargar la config. Convierte a async y añade:

```typescript
export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const config = await api.configuracion.obtener();

  const webhookUrl = `${env.NEXTAUTH_URL}/api/webhooks/github`;

  return (
    // ... resto igual ...
  );
}
```

El fichero completo actualizado queda:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { createServerCaller } from "@/server/caller";
import { ConfiguracionNotificaciones } from "@/components/dashboard/ConfiguracionNotificaciones";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const api = await createServerCaller();
  const config = await api.configuracion.obtener();

  const webhookUrl = `${env.NEXTAUTH_URL}/api/webhooks/github`;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-6">
        Configuración
      </h1>

      <div className="flex flex-col gap-6">
        <Section titulo="Sesión">
          <Campo label="Usuario" valor={session.user?.name ?? "—"} />
          <Campo label="Email" valor={session.user?.email ?? "—"} />
        </Section>

        <Section titulo="GitHub Webhooks">
          <p className="font-body text-xs text-text-muted mb-3">
            Configura este endpoint en GitHub para activar auto-deploys al hacer
            push a la rama configurada de cada proyecto.
          </p>
          <Campo label="Payload URL" valor={webhookUrl} mono />
          <Campo label="Content type" valor="application/json" mono />
          <Campo
            label="Secret"
            valor="Ver variable GITHUB_WEBHOOK_SECRET en el servidor"
          />
        </Section>

        <Section titulo="Notificaciones">
          <p className="font-body text-xs text-text-muted mb-3">
            Configura alertas cuando un deploy termine en éxito o error.
          </p>
          <ConfiguracionNotificaciones config={config} />
        </Section>

        <Section titulo="Sistema">
          <Campo label="Entorno" valor={env.NODE_ENV} mono />
          {env.PANEL_DOMAIN && (
            <Campo label="Dominio del panel" valor={env.PANEL_DOMAIN} mono />
          )}
          <Campo label="Socket Docker" valor={env.DOCKER_SOCKET_PATH} mono />
          <Campo label="Directorio repos" valor={env.REPOS_DIR} mono />
        </Section>
      </div>
    </div>
  );
}

function Section({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border rounded-[var(--radius-md)] p-4">
      <h2 className="font-display text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">
        {titulo}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Campo({
  label,
  valor,
  mono = false,
}: {
  label: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-xs text-text-muted">{label}</span>
      <span
        className={`font-body text-sm text-text-primary ${
          mono
            ? "bg-background border border-border rounded-[var(--radius-sm)] px-2 py-1 break-all"
            : ""
        }`}
      >
        {valor}
      </span>
    </div>
  );
}
```

- [ ] **Step 7: Ejecutar todos los tests**

```bash
npm run test:unit
```

Expected: todos los tests pasan.

- [ ] **Step 8: Verificar type-check**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/ConfiguracionNotificaciones.tsx src/components/dashboard/ConfiguracionNotificaciones.test.tsx "src/app/(panel)/actions.ts" "src/app/(panel)/configuracion/page.tsx"
git commit -m "feat: UI de notificaciones en /configuracion con tres canales configurables"
```

---

## Verificación final

```bash
npm run test:unit -- --coverage
npm run type-check
```

Cobertura esperada:

- `src/lib/notificaciones/webhook.ts`: 100% ✓
- `src/lib/notificaciones/email.ts`: 100% ✓
- `src/lib/notificaciones/telegram.ts`: 100% ✓
- `src/lib/notificaciones/index.ts`: 100% ✓
- `src/server/routers/configuracion.ts`: 100% ✓
- `src/components/dashboard/ConfiguracionNotificaciones.tsx`: ≥80% ✓
- type-check sin errores ✓
