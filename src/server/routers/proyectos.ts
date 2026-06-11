// src/server/routers/proyectos.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ejecutarDeploy } from "@/lib/docker/deploys";
import { descifrar } from "@/lib/crypto";
import { descifrarClavePrivada } from "@/server/routers/credenciales";
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
import {
  conectarTraefikARed,
  desconectarTraefikDeRed,
} from "@/lib/docker/traefik";
import { leerEstadoSSL } from "@/lib/ssl/acme";
import { enviarNotificacion } from "@/lib/notificaciones";

const proyectoInput = z.object({
  nombre: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, {
      message:
        "El nombre solo puede contener letras minúsculas, números y guiones",
    }),
  dominio: z
    .string()
    .regex(/^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, {
      message: "El dominio debe ser un hostname válido (ej: panel.ejemplo.com)",
    })
    .optional(),
  repositorioUrl: z.string().url().optional(),
  rama: z.string().optional(),
  tipo: z.enum(["compose", "dockerfile", "image", "nodejs"]).optional(),
  puerto: z.number().int().min(1).max(65535).optional(),
  imagenUrl: z.string().optional(),
  dockerfilePath: z.string().optional(),
  buildCommand: z.string().optional(),
  startCommand: z.string().optional(),
});

const idInput = z.object({ id: z.string() });

async function findProyectoOrThrow(id: string) {
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    include: { cliente: true, credencial: true },
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
      credencialId: proyecto.credencialId ?? null,
      tipo: proyecto.tipo,
      puerto: proyecto.puerto,
      imagenUrl: proyecto.imagenUrl,
      dockerfilePath: proyecto.dockerfilePath,
      buildCommand: proyecto.buildCommand,
      startCommand: proyecto.startCommand,
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
      await iniciarProyecto(proyecto.cliente.slug, proyecto.nombre);
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
      await detenerProyecto(proyecto.cliente.slug, proyecto.nombre);
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
      await restartProyecto(proyecto.cliente.slug, proyecto.nombre);
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
          tipo: input.tipo ?? "compose",
          puerto: input.puerto,
          imagenUrl: input.imagenUrl,
          dockerfilePath: input.dockerfilePath,
          buildCommand: input.buildCommand,
          startCommand: input.startCommand,
        },
        include: { cliente: true },
      });

      await asegurarRedCliente(creado.cliente.slug);

      if (creado.dominio) {
        const yaml = generarConfigTraefik({
          dominio: creado.dominio,
          proyectoSlug: creado.nombre,
          clienteSlug: creado.cliente.slug,
          ...(creado.puerto != null && { puerto: creado.puerto }),
        });
        await escribirConfigTraefik(creado.nombre, yaml);
        await conectarTraefikARed(creado.cliente.slug);
      }

      return creado;
    }),

  editar: protectedProcedure
    .input(proyectoInput.extend({ id: z.string() }))
    .mutation(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.id);
      if (
        input.nombre !== proyecto.nombre &&
        (proyecto.estado === "running" || proyecto.estado === "deploying")
      )
        throw new TRPCError({
          code: "CONFLICT",
          message: "No se puede renombrar un proyecto en ejecución",
        });

      const actualizado = await prisma.proyecto.update({
        where: { id: input.id },
        data: {
          nombre: input.nombre,
          dominio: input.dominio,
          repositorioUrl: input.repositorioUrl,
          rama: input.rama,
          tipo: input.tipo,
          puerto: input.puerto,
          imagenUrl: input.imagenUrl,
          dockerfilePath: input.dockerfilePath,
          buildCommand: input.buildCommand,
          startCommand: input.startCommand,
        },
        include: { cliente: true },
      });

      if (actualizado.dominio) {
        const yaml = generarConfigTraefik({
          dominio: actualizado.dominio,
          proyectoSlug: actualizado.nombre,
          clienteSlug: actualizado.cliente.slug,
          ...(actualizado.puerto != null && { puerto: actualizado.puerto }),
        });
        await escribirConfigTraefik(actualizado.nombre, yaml);
      } else {
        await eliminarConfigTraefik(proyecto.nombre);
      }

      if (!proyecto.dominio && actualizado.dominio) {
        await conectarTraefikARed(actualizado.cliente.slug);
      } else if (proyecto.dominio && !actualizado.dominio) {
        const otrosConDominio = await prisma.proyecto.count({
          where: {
            clienteId: proyecto.clienteId,
            dominio: { not: null },
            id: { not: input.id },
          },
        });
        if (otrosConDominio === 0)
          await desconectarTraefikDeRed(actualizado.cliente.slug);
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
    await prisma.proyecto.delete({ where: { id: input.id } });
    if (proyecto.dominio) {
      await eliminarConfigTraefik(proyecto.nombre);
      const otrosConDominio = await prisma.proyecto.count({
        where: {
          clienteId: proyecto.clienteId,
          dominio: { not: null },
          id: { not: input.id },
        },
      });
      if (otrosConDominio === 0)
        await desconectarTraefikDeRed(proyecto.cliente.slug);
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
    if (proyecto.tipo === "image" && !proyecto.imagenUrl)
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto no tiene imagen configurada",
      });
    if (proyecto.tipo !== "image" && !proyecto.repositorioUrl)
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto no tiene repositorio configurado",
      });

    const variablesDB = await prisma.variableEntorno.findMany({
      where: { proyectoId: input.id },
    });
    const variables = variablesDB.map((v) => ({
      clave: v.clave,
      valor: descifrar(v.valorCifrado, v.iv, v.authTag),
    }));

    const credencial = proyecto.credencialId
      ? { clavePrivada: await descifrarClavePrivada(proyecto.credencialId) }
      : undefined;

    const proyectoDeploying = await prisma.proyecto.update({
      where: { id: input.id },
      data: { estado: "deploying" },
    });

    // HACK: fire-and-forget — Next.js corre en Node.js persistente (no serverless),
    // el event loop mantiene viva la promesa hasta que el deploy termina.
    void ejecutarDeploy({
      proyectoId: input.id,
      tipo: proyecto.tipo,
      repoUrl: proyecto.repositorioUrl,
      rama: proyecto.rama,
      clienteSlug: proyecto.cliente.slug,
      proyectoNombre: proyecto.nombre,
      variables,
      credencial,
      imagenUrl: proyecto.imagenUrl,
      dockerfilePath: proyecto.dockerfilePath,
      buildCommand: proyecto.buildCommand,
      startCommand: proyecto.startCommand,
      puerto: proyecto.puerto,
    })
      .then(async ({ resultado, output }) => {
        await prisma.proyecto.update({
          where: { id: input.id },
          data: {
            estado: resultado === "exito" ? "running" : "error",
            ...(resultado === "exito"
              ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
              : {}),
          },
        });
        void enviarNotificacion({
          proyectoNombre: proyecto.nombre,
          clienteSlug: proyecto.cliente.slug,
          rama: proyecto.rama,
          sha: null,
          resultado,
          output,
        });
      })
      .catch(async () => {
        await prisma.proyecto.update({
          where: { id: input.id },
          data: { estado: "error" },
        });
      });

    return proyectoDeploying;
  }),

  asignarCredencial: protectedProcedure
    .input(z.object({ id: z.string(), credencialId: z.string().nullable() }))
    .mutation(async ({ input }) => {
      await findProyectoOrThrow(input.id);
      return prisma.proyecto.update({
        where: { id: input.id },
        data: { credencialId: input.credencialId },
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

  listarDeploys: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(async ({ input }) => {
      return prisma.deploy.findMany({
        where: { proyectoId: input.proyectoId },
        orderBy: { iniciadoEn: "desc" },
        take: 20,
        select: {
          id: true,
          rama: true,
          sha: true,
          resultado: true,
          output: true,
          iniciadoEn: true,
          finalizadoEn: true,
        },
      });
    }),

  rollback: protectedProcedure
    .input(z.object({ deployId: z.string() }))
    .mutation(async ({ input }) => {
      const deploy = await prisma.deploy.findUnique({
        where: { id: input.deployId },
      });
      if (!deploy)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deploy no encontrado",
        });
      if (deploy.resultado !== "exito" || !deploy.sha)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Solo se puede hacer rollback de deploys exitosos con SHA registrado",
        });

      const proyecto = await findProyectoOrThrow(deploy.proyectoId);
      if (proyecto.estado === "deploying")
        throw new TRPCError({
          code: "CONFLICT",
          message: "El proyecto ya está en proceso de deploy",
        });

      const variablesDB = await prisma.variableEntorno.findMany({
        where: { proyectoId: deploy.proyectoId },
      });
      const variables = variablesDB.map((v) => ({
        clave: v.clave,
        valor: descifrar(v.valorCifrado, v.iv, v.authTag),
      }));

      const credencial = proyecto.credencialId
        ? { clavePrivada: await descifrarClavePrivada(proyecto.credencialId) }
        : undefined;

      const proyectoDeploying = await prisma.proyecto.update({
        where: { id: deploy.proyectoId },
        data: { estado: "deploying" },
      });

      void ejecutarDeploy({
        proyectoId: deploy.proyectoId,
        tipo: proyecto.tipo,
        repoUrl: proyecto.repositorioUrl,
        rama: deploy.rama,
        sha: deploy.sha,
        clienteSlug: proyecto.cliente.slug,
        proyectoNombre: proyecto.nombre,
        variables,
        credencial,
        imagenUrl: proyecto.imagenUrl,
        dockerfilePath: proyecto.dockerfilePath,
        buildCommand: proyecto.buildCommand,
        startCommand: proyecto.startCommand,
        puerto: proyecto.puerto,
      })
        .then(async ({ resultado, output }) => {
          await prisma.proyecto.update({
            where: { id: deploy.proyectoId },
            data: {
              estado: resultado === "exito" ? "running" : "error",
              ...(resultado === "exito"
                ? { ultimoDeployEn: new Date(), ultimoDeployRama: deploy.rama }
                : {}),
            },
          });
          void enviarNotificacion({
            proyectoNombre: proyecto.nombre,
            clienteSlug: proyecto.cliente.slug,
            rama: deploy.rama,
            sha: deploy.sha,
            resultado,
            output,
          });
        })
        .catch(async () => {
          await prisma.proyecto.update({
            where: { id: deploy.proyectoId },
            data: { estado: "error" },
          });
        });

      return proyectoDeploying;
    }),

  estadoSSL: protectedProcedure
    .input(z.object({ dominio: z.string() }))
    .query(async ({ input }) => {
      return leerEstadoSSL(input.dominio);
    }),

  listar: protectedProcedure.query(async () => {
    const clientes = await prisma.cliente.findMany({
      include: {
        proyectos: {
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
        tipo: p.tipo,
        puerto: p.puerto,
        imagenUrl: p.imagenUrl,
        dockerfilePath: p.dockerfilePath,
        buildCommand: p.buildCommand,
        startCommand: p.startCommand,
        ultimoDeploy:
          p.ultimoDeployEn && p.ultimoDeployRama
            ? { hace: formatHace(p.ultimoDeployEn), rama: p.ultimoDeployRama }
            : null,
      })),
    }));
  }),
});
