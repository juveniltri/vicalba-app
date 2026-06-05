// src/server/routers/proyectos.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  DockerError,
  detenerProyecto,
  iniciarProyecto,
} from "@/lib/docker/proyectos";
import { formatHace } from "@/lib/formatHace";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const idInput = z.object({ id: z.string() });

async function findProyectoOrThrow(id: string) {
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    include: { cliente: true, servicios: true },
  });
  if (!proyecto)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Proyecto no encontrado",
    });
  return proyecto;
}

export const proyectosRouter = router({
  iniciar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    try {
      await iniciarProyecto(
        proyecto.cliente.slug,
        proyecto.nombre,
        proyecto.servicios.map((s) => s.nombre),
      );
    } catch (err) {
      if (err instanceof DockerError)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      throw err;
    }
    return prisma.proyecto.update({
      where: { id: input.id },
      data: { estado: "running" },
    });
  }),

  detener: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    try {
      await detenerProyecto(
        proyecto.cliente.slug,
        proyecto.nombre,
        proyecto.servicios.map((s) => s.nombre),
      );
    } catch (err) {
      if (err instanceof DockerError)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
        });
      throw err;
    }
    return prisma.proyecto.update({
      where: { id: input.id },
      data: { estado: "stopped" },
    });
  }),

  listar: protectedProcedure.query(async () => {
    const clientes = await prisma.cliente.findMany({
      include: {
        proyectos: {
          include: { servicios: true },
          orderBy: { nombre: "asc" },
        },
      },
      orderBy: { nombre: "asc" },
    });

    return clientes.map((cliente) => ({
      slug: cliente.slug,
      nombre: cliente.nombre,
      proyectos: cliente.proyectos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        clienteSlug: cliente.slug,
        estado: p.estado,
        dominio: p.dominio,
        servicios: p.servicios.map((s) => ({
          nombre: s.nombre,
          estado: s.estado,
        })),
        ultimoDeploy:
          p.ultimoDeployEn && p.ultimoDeployRama
            ? { hace: formatHace(p.ultimoDeployEn), rama: p.ultimoDeployRama }
            : null,
      })),
    }));
  }),
});
