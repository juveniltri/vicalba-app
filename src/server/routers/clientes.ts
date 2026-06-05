import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, {
    message: "El slug solo puede contener letras minúsculas, números y guiones",
  });

async function findClienteOrThrow(id: string) {
  const cliente = await prisma.cliente.findUnique({ where: { id } });
  if (!cliente)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cliente no encontrado",
    });
  return cliente;
}

export const clientesRouter = router({
  crear: protectedProcedure
    .input(z.object({ slug: slugSchema, nombre: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await prisma.cliente.create({ data: input });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "El slug ya existe",
          });
        throw err;
      }
    }),

  editar: protectedProcedure
    .input(z.object({ id: z.string(), nombre: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await findClienteOrThrow(input.id);
      return prisma.cliente.update({
        where: { id: input.id },
        data: { nombre: input.nombre },
      });
    }),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await findClienteOrThrow(input.id);
      const count = await prisma.proyecto.count({
        where: { clienteId: input.id },
      });
      if (count > 0)
        throw new TRPCError({
          code: "CONFLICT",
          message: "No se puede eliminar un cliente con proyectos",
        });
      await prisma.cliente.delete({ where: { id: input.id } });
    }),
});
