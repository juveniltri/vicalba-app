import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { depsAplicarTraefik } from "@/lib/docker/traefik";
import {
  lanzarAplicacionProxy,
  leerConfiguracionProxy,
  OperacionProxyEnCurso,
} from "@/lib/proxy/operacion";
import { descargarRangosCloudflare } from "@/lib/proxy/cloudflare";
import { prisma } from "@/lib/prisma";
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

  rangosCloudflare: protectedProcedure.query(async () => {
    try {
      return await descargarRangosCloudflare();
    } catch (err) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }),

  aplicar: protectedProcedure
    .input(
      configuracionProxySchema.extend({
        // undefined keeps the stored token, null removes it
        tokenCloudflare: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{1,200}$/, "Token de Cloudflare no válido")
          .nullish(),
      }),
    )
    .mutation(async ({ input: { tokenCloudflare, ...config } }) => {
      // Empty ranges would make every «Solo desde Cloudflare» route reject all traffic.
      if (
        config.cloudflare.rangos.length === 0 &&
        (await prisma.rutaProyecto.count({ where: { soloCloudflare: true } })) >
          0
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hay rutas con «Solo desde Cloudflare»: los rangos no pueden quedar vacíos",
        });
      try {
        // The result lands in the DB; the UI polls `obtener` until it's there.
        await lanzarAplicacionProxy(config, tokenCloudflare);
      } catch (err) {
        if (err instanceof OperacionProxyEnCurso)
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        throw err;
      }
      return { estado: "en_curso" as const };
    }),
});
