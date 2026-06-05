import path from "node:path";
import { defineConfig } from "prisma/config";

// NOTE: prisma.config.ts is evaluated outside of Next.js, so env vars from
// .env.local are not injected automatically. In CI/production, DATABASE_URL
// must be set as a real environment variable.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
