// src/server/routers/proyectos.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deployProyecto } from "@/lib/docker/deploy";
import { descifrar } from "@/lib/crypto";
import {
  DockerError,
  detenerProyecto,
  iniciarProyecto,
  restartProyecto,
} from "@/lib/docker/proyectos";
import { formatHace } from "@/lib/formatHace";
import { prisma } from "@/lib/prisma";
import { asegurarRedCliente, eliminarRedCliente } from "@/lib/docker/networks";
import {
  eliminarConfigTraefik,
  escribirConfigTraefik,
  generarConfigTraefik,
} from "@/lib/traefik/config";
import { protectedProcedure, router } from "@/server/trpc";

const proyectoInput = z.object({
  nombre: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, {
      message:
        "El nombre solo puede contener letras minúsculas, números y guiones",
    }),
  dominio: z.string().optional(),
  repositorioUrl: z.string().url().optional(),
  rama: z.string().optional(),
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
  obtener: protectedProcedure.input(idInput).query(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      clienteSlug: proyecto.cliente.slug,
      clienteNombre: proyecto.cliente.nombre,
      estado: proyecto.estado,
      dominio: proyecto.dominio,
      repositorioUrl: proyecto.repositorioUrl,
      rama: proyecto.rama,
      autoDeployHabilitado: proyecto.autoDeployHabilitado,
      servicios: proyecto.servicios.map((s) => ({
        nombre: s.nombre,
        estado: s.estado,
      })),
      ultimoDeploy:
        proyecto.ultimoDeployEn && proyecto.ultimoDeployRama
          ? {
              hace: formatHace(proyecto.ultimoDeployEn),
              rama: proyecto.ultimoDeployRama,
            }
          : null,
    };
  }),

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
      const creado = await prisma.proyecto.create({
        data: {
          nombre: input.nombre,
          clienteId: input.clienteId,
          dominio: input.dominio,
          repositorioUrl: input.repositorioUrl,
          rama: input.rama ?? "main",
          servicios: { create: input.servicios.map((nombre) => ({ nombre })) },
        },
        include: { servicios: true, cliente: true },
      });

      await asegurarRedCliente(creado.cliente.slug);

      if (creado.dominio) {
        const yaml = generarConfigTraefik({
          dominio: creado.dominio,
          proyectoSlug: creado.nombre,
          clienteSlug: creado.cliente.slug,
        });
        await escribirConfigTraefik(creado.nombre, yaml);
      }

      return creado;
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

      const actualizado = await prisma.proyecto.update({
        where: { id: input.id },
        data: {
          nombre: input.nombre,
          dominio: input.dominio,
          repositorioUrl: input.repositorioUrl,
          rama: input.rama,
          servicios: {
            create: toAdd.map((nombre) => ({ nombre })),
            deleteMany: { nombre: { in: toRemove } },
          },
        },
        include: { servicios: true, cliente: true },
      });

      if (actualizado.dominio) {
        const yaml = generarConfigTraefik({
          dominio: actualizado.dominio,
          proyectoSlug: actualizado.nombre,
          clienteSlug: actualizado.cliente.slug,
        });
        await escribirConfigTraefik(actualizado.nombre, yaml);
      } else {
        await eliminarConfigTraefik(proyecto.nombre);
      }

      return actualizado;
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
    if (proyecto.dominio) {
      await eliminarConfigTraefik(proyecto.nombre);
    }
    const restantes = await prisma.proyecto.count({
      where: { clienteId: proyecto.clienteId },
    });
    if (restantes === 0) {
      await eliminarRedCliente(proyecto.cliente.slug);
    }
  }),

  deploy: protectedProcedure.input(idInput).mutation(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    if (proyecto.estado === "deploying")
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto ya está en proceso de deploy",
      });
    if (!proyecto.repositorioUrl)
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto no tiene repositorio configurado",
      });

    await prisma.proyecto.update({
      where: { id: input.id },
      data: { estado: "deploying" },
    });

    try {
      const variablesDB = await prisma.variableEntorno.findMany({
        where: { proyectoId: input.id },
      });
      const variables = variablesDB.map((v) => ({
        clave: v.clave,
        valor: descifrar(v.valorCifrado, v.iv, v.authTag),
      }));

      await deployProyecto({
        repoUrl: proyecto.repositorioUrl,
        rama: proyecto.rama,
        clienteSlug: proyecto.cliente.slug,
        proyectoNombre: proyecto.nombre,
        servicios: proyecto.servicios.map((s) => s.nombre),
        variables,
      });
    } catch (err) {
      await prisma.proyecto.update({
        where: { id: input.id },
        data: { estado: "error" },
      });
      throw err;
    }

    return prisma.proyecto.update({
      where: { id: input.id },
      data: {
        estado: "running",
        ultimoDeployEn: new Date(),
        ultimoDeployRama: proyecto.rama,
      },
    });
  }),

  toggleAutoDeploy: protectedProcedure
    .input(idInput)
    .mutation(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.id);
      return prisma.proyecto.update({
        where: { id: input.id },
        data: { autoDeployHabilitado: !proyecto.autoDeployHabilitado },
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
      id: cliente.id,
      slug: cliente.slug,
      nombre: cliente.nombre,
      proyectos: cliente.proyectos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        clienteSlug: cliente.slug,
        estado: p.estado,
        dominio: p.dominio,
        repositorioUrl: p.repositorioUrl,
        rama: p.rama,
        autoDeployHabilitado: p.autoDeployHabilitado,
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
