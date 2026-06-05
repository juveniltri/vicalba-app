// src/server/routers/proyectos.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  DockerError,
  detenerProyecto,
  iniciarProyecto,
  restartProyecto,
} from "@/lib/docker/proyectos";
import { formatHace } from "@/lib/formatHace";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const proyectoInput = z.object({
  nombre: z.string().min(1),
  dominio: z.string().optional(),
  servicios: z.array(z.string().min(1)).min(1),
});

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

  restart: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    try {
      await restartProyecto(
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

  crear: protectedProcedure
    .input(proyectoInput.extend({ clienteId: z.string() }))
    .mutation(async ({ input }) => {
      const cliente = await prisma.cliente.findUnique({
        where: { id: input.clienteId },
      });
      if (!cliente)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Cliente no encontrado",
        });
      return prisma.proyecto.create({
        data: {
          nombre: input.nombre,
          clienteId: input.clienteId,
          dominio: input.dominio,
          servicios: { create: input.servicios.map((nombre) => ({ nombre })) },
        },
        include: { servicios: true, cliente: true },
      });
    }),

  editar: protectedProcedure
    .input(proyectoInput.extend({ id: z.string() }))
    .mutation(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.id);
      if (proyecto.estado === "running" || proyecto.estado === "deploying")
        throw new TRPCError({
          code: "CONFLICT",
          message: "No se puede editar un proyecto en ejecución",
        });

      const currentNames = proyecto.servicios.map((s) => s.nombre);
      const toAdd = input.servicios.filter((n) => !currentNames.includes(n));
      const toRemove = currentNames.filter((n) => !input.servicios.includes(n));

      return prisma.proyecto.update({
        where: { id: input.id },
        data: {
          nombre: input.nombre,
          dominio: input.dominio,
          servicios: {
            create: toAdd.map((nombre) => ({ nombre })),
            deleteMany: { nombre: { in: toRemove } },
          },
        },
        include: { servicios: true, cliente: true },
      });
    }),

  eliminar: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    if (proyecto.estado === "running" || proyecto.estado === "deploying")
      throw new TRPCError({
        code: "CONFLICT",
        message: "No se puede eliminar un proyecto en ejecución",
      });
    await prisma.servicio.deleteMany({ where: { proyectoId: input.id } });
    await prisma.proyecto.delete({ where: { id: input.id } });
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
      id: cliente.id,
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
