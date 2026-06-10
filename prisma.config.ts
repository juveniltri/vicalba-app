import path from "node:path";
import { defineConfig } from "prisma/config";
import { config as loadEnv } from "dotenv";

// prisma.config.ts runs outside Next.js — .env.local is not injected automatically.
// Load it explicitly for local dev; in CI/production DATABASE_URL is a real env var.
loadEnv({ path: ".env.local", override: false });

// Solo sobreescribir datasource.url si DATABASE_URL está definida.
// Si no está, Prisma lee env("DATABASE_URL") del schema.prisma directamente.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  ...(process.env.DATABASE_URL && {
    datasource: { url: process.env.DATABASE_URL },
  }),
});
