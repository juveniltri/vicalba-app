// src/server/routers/_app.ts
import { router } from "@/server/trpc";
import { proyectosRouter } from "./proyectos";

export const appRouter = router({
  proyectos: proyectosRouter,
});

export type AppRouter = typeof appRouter;
