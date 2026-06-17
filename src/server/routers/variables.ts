import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cifrar, descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const idInput = z.object({ id: z.string() });

const claveSchema = z
  .string()
  .min(1)
  .regex(
    /^[A-Z_][A-Z0-9_]*$/,
    "La clave solo puede contener mayúsculas, números y guiones bajos (ej: DATABASE_URL)",
  );

async function findVariableOrThrow(id: string) {
  const variable = await prisma.variableEntorno.findUnique({ where: { id } });
  if (!variable)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Variable no encontrada",
    });
  return variable;
}

export const variablesRouter = router({
  listar: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(async ({ input }) => {
      return prisma.variableEntorno.findMany({
        where: { proyectoId: input.proyectoId },
        select: { id: true, clave: true, enBuildTime: true, creadoEn: true },
        orderBy: { clave: "asc" },
      });
    }),

  crear: protectedProcedure
    .input(
      z.object({
        proyectoId: z.string(),
        clave: claveSchema,
        valor: z.string(),
        enBuildTime: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const { valorCifrado, iv, authTag } = cifrar(input.valor);
      try {
        return await prisma.variableEntorno.create({
          data: {
            proyectoId: input.proyectoId,
            clave: input.clave,
            valorCifrado,
            iv,
            authTag,
            enBuildTime: input.enBuildTime,
          },
          select: { id: true, clave: true, enBuildTime: true, creadoEn: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "La clave ya existe en este proyecto",
          });
        throw err;
      }
    }),

  actualizar: protectedProcedure
    .input(z.object({ id: z.string(), valor: z.string() }))
    .mutation(async ({ input }) => {
      await findVariableOrThrow(input.id);
      const { valorCifrado, iv, authTag } = cifrar(input.valor);
      return prisma.variableEntorno.update({
        where: { id: input.id },
        data: { valorCifrado, iv, authTag },
        select: { id: true, clave: true, enBuildTime: true, creadoEn: true },
      });
    }),

  toggleBuildTime: protectedProcedure
    .input(z.object({ id: z.string(), enBuildTime: z.boolean() }))
    .mutation(async ({ input }) => {
      await findVariableOrThrow(input.id);
      return prisma.variableEntorno.update({
        where: { id: input.id },
        data: { enBuildTime: input.enBuildTime },
        select: { id: true, clave: true, enBuildTime: true, creadoEn: true },
      });
    }),

  eliminar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    await findVariableOrThrow(input.id);
    await prisma.variableEntorno.delete({ where: { id: input.id } });
  }),

  revelar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const variable = await findVariableOrThrow(input.id);
    return {
      valor: descifrar(variable.valorCifrado, variable.iv, variable.authTag),
    };
  }),
});
