import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Base de datos
  DATABASE_URL: z.string().url("DATABASE_URL debe ser una URL válida"),

  // Auth
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET debe tener al menos 32 caracteres"),
  NEXTAUTH_URL: z.string().url(),

  // GitHub Webhooks — validación HMAC-SHA256 de payloads entrantes
  GITHUB_WEBHOOK_SECRET: z.string().min(16),

  // Cifrado AES-256-GCM para variables de entorno de proyectos
  ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      "ENCRYPTION_KEY debe ser exactamente 64 caracteres hexadecimales (32 bytes)",
    ),

  // Docker — ruta al socket del daemon (por defecto el estándar de Linux)
  DOCKER_SOCKET_PATH: z.string().default("/var/run/docker.sock"),

  // Deploy — directorio donde Traefik lee su config dinámica
  TRAEFIK_DYNAMIC_DIR: z.string().default("/etc/traefik/dynamic"),
  // Deploy — directorio local donde se clonan los repos de los proyectos
  REPOS_DIR: z.string().default("/var/vicalba/repos"),
  TRAEFIK_CONTAINER_NAME: z.string().default("traefik"),
  ACME_JSON_PATH: z.string().default("/var/vicalba/traefik/acme.json"),

  // Panel — dominio público del panel (usado en next.config.ts para redirects HTTPS)
  PANEL_DOMAIN: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Monitoring (opcional — el panel arranca sin Sentry)
  SENTRY_DSN: z.string().url().optional(),
});

const clientSchema = z.object({
  // Sin variables públicas por ahora — panel 100% interno
});

// Durante el build de Docker no hay variables reales. SKIP_ENV_VALIDATION=1
// inyecta valores dummy que pasan la validación de Zod para que el build
// complete. En runtime (sin el flag) se validan las variables reales.
const buildTimeDummy = {
  NODE_ENV: "production" as const,
  DATABASE_URL: "postgresql://build:build@localhost/build",
  NEXTAUTH_SECRET: "build-time-placeholder-do-not-use-in-production",
  NEXTAUTH_URL: "https://localhost",
  GITHUB_WEBHOOK_SECRET: "build-time-placeholder",
  ENCRYPTION_KEY: "0".repeat(64),
  DOCKER_SOCKET_PATH: "/var/run/docker.sock",
  TRAEFIK_DYNAMIC_DIR: "/etc/traefik/dynamic",
  REPOS_DIR: "/var/vicalba/repos",
  TRAEFIK_CONTAINER_NAME: "traefik",
  ACME_JSON_PATH: "/var/vicalba/traefik/acme.json",
  LOG_LEVEL: "info" as const,
};

const serverResult = serverSchema.safeParse(
  process.env.SKIP_ENV_VALIDATION === "1" ? buildTimeDummy : process.env,
);

if (!serverResult.success) {
  console.error("❌ Variables de entorno del servidor inválidas:");
  console.error(serverResult.error.flatten().fieldErrors);
  process.exit(1);
}

const clientResult = clientSchema.safeParse({});
if (!clientResult.success) {
  console.error("❌ Variables de entorno del cliente inválidas:");
  console.error(clientResult.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...serverResult.data,
  ...clientResult.data,
} as const;

export type Env = typeof env;
