import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { cifrar, descifrar } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const idInput = z.object({ id: z.string() });

async function findCredencialOrThrow(id: string) {
  const credencial = await prisma.credencial.findUnique({ where: { id } });
  if (!credencial)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Credencial no encontrada",
    });
  return credencial;
}

export async function descifrarClavePrivada(
  credencialId: string,
): Promise<string> {
  const credencial = await prisma.credencial.findUnique({
    where: { id: credencialId },
  });
  if (!credencial) throw new Error(`Credencial ${credencialId} no encontrada`);
  return descifrar(
    credencial.clavePrivadaCifrada,
    credencial.iv,
    credencial.authTag,
  );
}

export const credencialesRouter = router({
  listar: protectedProcedure.query(async () => {
    return prisma.credencial.findMany({
      select: { id: true, nombre: true, clavePublica: true, creadoEn: true },
      orderBy: { nombre: "asc" },
    });
  }),

  crear: protectedProcedure
    .input(
      z.object({
        nombre: z.string().min(1),
        clavePublica: z.string().min(1),
        clavePrivada: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { valorCifrado, iv, authTag } = cifrar(input.clavePrivada);
      try {
        return await prisma.credencial.create({
          data: {
            nombre: input.nombre,
            clavePublica: input.clavePublica,
            clavePrivadaCifrada: valorCifrado,
            iv,
            authTag,
          },
          select: {
            id: true,
            nombre: true,
            clavePublica: true,
            creadoEn: true,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe una credencial con ese nombre",
          });
        throw err;
      }
    }),

  eliminar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    await findCredencialOrThrow(input.id);
    await prisma.credencial.delete({ where: { id: input.id } });
  }),

  obtenerClavePublica: protectedProcedure
    .input(idInput)
    .query(async ({ input }) => {
      const credencial = await findCredencialOrThrow(input.id);
      return { clavePublica: credencial.clavePublica };
    }),
});
