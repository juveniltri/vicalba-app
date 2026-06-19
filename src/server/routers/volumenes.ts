import { mkdir } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import { rutaHostVolumen } from "@/lib/volumenes";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const nombreSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9_-]+$/,
    "El nombre solo puede contener letras minúsculas, números, guiones y guiones bajos",
  );

async function findVolumenOrThrow(id: string) {
  const volumen = await prisma.volumen.findUnique({
    where: { id },
    include: { proyecto: { include: { cliente: true } } },
  });
  if (!volumen)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Volumen no encontrado",
    });
  return volumen;
}

export const volumenesRouter = router({
  listar: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(({ input }) =>
      prisma.volumen.findMany({
        where: { proyectoId: input.proyectoId },
        orderBy: { creadoEn: "asc" },
      }),
    ),

  crear: protectedProcedure
    .input(
      z.object({
        proyectoId: z.string(),
        nombre: nombreSchema,
        rutaContenedor: z.string().min(1).startsWith("/"),
      }),
    )
    .mutation(async ({ input }) => {
      const proyecto = await prisma.proyecto.findUnique({
        where: { id: input.proyectoId },
        include: { cliente: true },
      });
      if (!proyecto)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proyecto no encontrado",
        });

      const hostDir = rutaHostVolumen(
        env.REPOS_DIR,
        proyecto.cliente.slug,
        proyecto.nombre,
        input.nombre,
      );
      await mkdir(hostDir, { recursive: true, mode: 0o755 });

      try {
        return await prisma.volumen.create({
          data: {
            proyectoId: input.proyectoId,
            nombre: input.nombre,
            rutaContenedor: input.rutaContenedor,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe un volumen con ese nombre en este proyecto",
          });
        throw err;
      }
    }),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await findVolumenOrThrow(input.id);
      await prisma.volumen.delete({ where: { id: input.id } });
    }),
});
