import { TRPCError } from "@trpc/server";
import { depsAplicarTraefik } from "@/lib/docker/traefik";
import {
  lanzarAplicacionProxy,
  leerConfiguracionProxy,
  OperacionProxyEnCurso,
} from "@/lib/proxy/operacion";
import { configuracionProxySchema } from "@/lib/schemas/proxy";
import { protectedProcedure, router } from "@/server/trpc";

export const proxyRouter = router({
  obtener: protectedProcedure.query(() => leerConfiguracionProxy()),

  log: protectedProcedure.query(() =>
    depsAplicarTraefik()
      .ultimasLineasLog()
      .catch(
        (err: unknown) => `No se pudo leer el log de Traefik: ${String(err)}`,
      ),
  ),

  aplicar: protectedProcedure
    .input(configuracionProxySchema)
    .mutation(async ({ input }) => {
      try {
        // The result lands in the DB; the UI polls `obtener` until it's there.
        await lanzarAplicacionProxy(input);
      } catch (err) {
        if (err instanceof OperacionProxyEnCurso)
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        throw err;
      }
      return { estado: "en_curso" as const };
    }),
});
