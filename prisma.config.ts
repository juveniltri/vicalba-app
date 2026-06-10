import path from "node:path";
import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

// Prisma 6 exige datasource.url en este fichero — no lee env("DATABASE_URL")
// del schema.prisma cuando prisma.config.ts está presente.
// Carga .env.local (dev local) y .env (Docker/CI) para tener DATABASE_URL disponible.
loadEnv({ path: ".env.local", override: false });
loadEnv({ path: ".env", override: false });

const url = process.env.DATABASE_URL;

// En build time (SKIP_ENV_VALIDATION=1) no hay DATABASE_URL real.
// prisma generate no necesita conexión a BD, solo el schema.
// En runtime (migrate deploy) DATABASE_URL siempre debe estar presente.
if (!url && process.env.SKIP_ENV_VALIDATION !== "1") {
  throw new Error(
    "DATABASE_URL es obligatoria. Defínela en .env.local (dev) o como variable de entorno (producción).",
  );
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(url && { datasource: { url } }),
});
