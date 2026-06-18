import { router } from "@/server/trpc";
import { clientesRouter } from "./clientes";
import { configuracionRouter } from "./configuracion";
import { credencialesRouter } from "./credenciales";
import { proyectosRouter } from "./proyectos";
import { usuariosRouter } from "./usuarios";
import { variablesRouter } from "./variables";

export const appRouter = router({
  clientes: clientesRouter,
  configuracion: configuracionRouter,
  credenciales: credencialesRouter,
  proyectos: proyectosRouter,
  usuarios: usuariosRouter,
  variables: variablesRouter,
});

export type AppRouter = typeof appRouter;
