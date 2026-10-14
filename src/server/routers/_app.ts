import { router } from "@/server/trpc";
import { backupsRouter } from "./backups";
import { clientesRouter } from "./clientes";
import { configuracionRouter } from "./configuracion";
import { credencialesRouter } from "./credenciales";
import { proyectosRouter } from "./proyectos";
import { usuariosRouter } from "./usuarios";
import { variablesRouter } from "./variables";
import { volumenesRouter } from "./volumenes";

export const appRouter = router({
  backups: backupsRouter,
  clientes: clientesRouter,
  configuracion: configuracionRouter,
  credenciales: credencialesRouter,
  proyectos: proyectosRouter,
  usuarios: usuariosRouter,
  variables: variablesRouter,
  volumenes: volumenesRouter,
});

export type AppRouter = typeof appRouter;
