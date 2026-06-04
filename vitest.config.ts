import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/**",
        "dist/**",
        ".next/**",
        "coverage/**",
        "**/*.config.*",
        "**/*.d.ts",
        "**/test/**",
        // Infrastructure tier — 0% por diseño
        "src/app/**",
        "src/server/**",
        "src/db/**",
        "src/env.ts",
        "src/styles/**",
      ],
      thresholds: {
        // Core — 100%: lógica de Docker, Traefik y schemas Zod
        "src/lib/docker/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/traefik/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        "src/lib/schemas/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        // Important — 80%: componentes UI y hooks
        "src/components/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        "src/hooks/**": {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
