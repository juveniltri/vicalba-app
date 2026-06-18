import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const idInput = z.object({ id: z.string() });

const userSelect = {
  id: true,
  email: true,
  nombre: true,
  creadoEn: true,
  passwordHash: false,
};

async function findUserOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Usuario no encontrado",
    });
  return user;
}

export const usuariosRouter = router({
  listar: protectedProcedure.query(() =>
    prisma.user.findMany({
      select: userSelect,
      orderBy: { creadoEn: "asc" },
    }),
  ),

  crear: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        nombre: z.string().min(1),
        password: z.string().min(8),
      }),
    )
    .mutation(async ({ input }) => {
      const passwordHash = await bcrypt.hash(input.password, 12);
      try {
        return await prisma.user.create({
          data: { email: input.email, nombre: input.nombre, passwordHash },
          select: userSelect,
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "El email ya está en uso",
          });
        throw err;
      }
    }),

  actualizar: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        nombre: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input }) => {
      await findUserOrThrow(input.id);
      try {
        return await prisma.user.update({
          where: { id: input.id },
          data: { nombre: input.nombre, email: input.email },
          select: userSelect,
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002")
          throw new TRPCError({
            code: "CONFLICT",
            message: "El email ya está en uso",
          });
        throw err;
      }
    }),

  cambiarPassword: protectedProcedure
    .input(z.object({ id: z.string(), password: z.string().min(8) }))
    .mutation(async ({ input }) => {
      await findUserOrThrow(input.id);
      const passwordHash = await bcrypt.hash(input.password, 12);
      await prisma.user.update({
        where: { id: input.id },
        data: { passwordHash },
      });
    }),

  eliminar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    await findUserOrThrow(input.id);
    await prisma.user.delete({ where: { id: input.id } });
  }),
});
