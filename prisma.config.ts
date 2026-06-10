import path from "node:path";
import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

// prisma.config.ts runs outside Next.js — .env.local is not injected automatically.
// Load it explicitly for local dev; in CI/production DATABASE_URL is a real env var.
loadEnv({ path: ".env.local", override: false });

// No sobreescribir datasource aquí — schema.prisma ya tiene url = env("DATABASE_URL").
// loadEnv() de arriba pone DATABASE_URL en process.env para dev local;
// en Docker lo inyecta docker-compose directamente.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
});
