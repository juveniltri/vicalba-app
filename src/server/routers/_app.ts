// src/server/routers/_app.ts
import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { proyectosRouter } from "./proyectos";

export const appRouter = router({
  clientes: clientesRouter,
  proyectos: proyectosRouter,
});

export type AppRouter = typeof appRouter;
