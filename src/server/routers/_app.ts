import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { proyectosRouter } from "./proyectos";
import { variablesRouter } from "./variables";

export const appRouter = router({
  clientes: clientesRouter,
  proyectos: proyectosRouter,
  variables: variablesRouter,
});

export type AppRouter = typeof appRouter;
