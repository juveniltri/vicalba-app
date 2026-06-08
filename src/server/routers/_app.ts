import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { configuracionRouter } from "./configuracion";
import { credencialesRouter } from "./credenciales";
import { proyectosRouter } from "./proyectos";
import { variablesRouter } from "./variables";

export const appRouter = router({
  clientes: clientesRouter,
  configuracion: configuracionRouter,
  credenciales: credencialesRouter,
  proyectos: proyectosRouter,
  variables: variablesRouter,
});

export type AppRouter = typeof appRouter;
