// src/server/routers/proyectos.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ejecutarDeploy } from "@/lib/docker/deploys";
import { prepararRepo } from "@/lib/docker/deploy";
import { descifrar } from "@/lib/crypto";
import { env } from "@/env";
import { rutaHostVolumen } from "@/lib/volumenes";
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
import { leerCertificados, leerEstadoSSL } from "@/lib/ssl/acme";
import { enviarNotificacion } from "@/lib/notificaciones";
import { ultimasLineas } from "@/lib/deploy-stream";

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

type ProyectoConCliente = Awaited<ReturnType<typeof findProyectoOrThrow>>;

// Single entry point for every deploy trigger (button, rollback, GitHub webhook)
// so all of them deploy with the same variables, volumes and compose content.
export async function lanzarDeploy(
  proyecto: ProyectoConCliente,
  opts: {
    rama: string;
    sha?: string;
    origen: "manual" | "webhook" | "rollback";
  },
) {
  const [variablesDB, volumenesDB] = await Promise.all([
    prisma.variableEntorno.findMany({ where: { proyectoId: proyecto.id } }),
    prisma.volumen.findMany({ where: { proyectoId: proyecto.id } }),
  ]);
  // compose+content: build-time flag has no meaning (no docker build step),
  // all vars must reach the --env-file for ${VAR} substitution in the YAML.
  const isComposeDirecto =
    proyecto.tipo === "compose" && !!proyecto.composeContent;
  const descifrada = (v: (typeof variablesDB)[number]) => ({
    clave: v.clave,
    valor: descifrar(v.valorCifrado, v.iv, v.authTag),
  });
  const variables = variablesDB
    .filter((v) => isComposeDirecto || !v.enBuildTime)
    .map(descifrada);
  const variablesBuildTime = isComposeDirecto
    ? []
    : variablesDB.filter((v) => v.enBuildTime).map(descifrada);
  const volumenes = volumenesDB.map((v) => ({
    rutaHost: rutaHostVolumen(
      env.REPOS_DIR,
      proyecto.cliente.slug,
      proyecto.nombre,
      v.nombre,
    ),
    rutaContenedor: v.rutaContenedor,
  }));

  const credencial = proyecto.credencialId
    ? { clavePrivada: await descifrarClavePrivada(proyecto.credencialId) }
    : undefined;

  const proyectoDeploying = await prisma.proyecto.update({
    where: { id: proyecto.id },
    data: { estado: "deploying" },
  });

  // HACK: fire-and-forget — Next.js corre en Node.js persistente (no serverless),
  // el event loop mantiene viva la promesa hasta que el deploy termina.
  void ejecutarDeploy({
    proyectoId: proyecto.id,
    origen: opts.origen,
    tipo: proyecto.tipo,
    repoUrl: proyecto.repositorioUrl,
    rama: opts.rama,
    sha: opts.sha,
    clienteSlug: proyecto.cliente.slug,
    proyectoNombre: proyecto.nombre,
    composeContent: proyecto.composeContent,
    variables,
    variablesBuildTime,
    credencial,
    imagenUrl: proyecto.imagenUrl,
    dockerfilePath: proyecto.dockerfilePath,
    buildCommand: proyecto.buildCommand,
    startCommand: proyecto.startCommand,
    puerto: proyecto.puerto,
    volumenes,
  })
    .then(async ({ resultado, output }) => {
      await prisma.proyecto.update({
        where: { id: proyecto.id },
        data: {
          estado: resultado === "exito" ? "running" : "error",
          ...(resultado === "exito"
            ? { ultimoDeployEn: new Date(), ultimoDeployRama: opts.rama }
            : {}),
        },
      });
      void enviarNotificacion({
        proyectoNombre: proyecto.nombre,
        clienteSlug: proyecto.cliente.slug,
        rama: opts.rama,
        sha: opts.sha ?? null,
        resultado,
        output,
      });
    })
    .catch(async () => {
      await prisma.proyecto.update({
        where: { id: proyecto.id },
        data: { estado: "error" },
      });
    });

  return proyectoDeploying;
}

export const proyectosRouter = router({
  obtener: protectedProcedure.input(idInput).query(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    const cert = proyecto.dominio
      ? (await leerCertificados())[proyecto.dominio]
      : undefined;
    return {
      ssl: proyecto.dominio
        ? { activo: !!cert, caducaEn: cert?.caducaEn ?? null }
        : null,
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
      composeContent: proyecto.composeContent ?? null,
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
    const needsRepo =
      proyecto.tipo !== "image" &&
      !(proyecto.tipo === "compose" && proyecto.composeContent);
    if (needsRepo && !proyecto.repositorioUrl)
      throw new TRPCError({
        code: "CONFLICT",
        message: "El proyecto no tiene repositorio configurado",
      });

    return lanzarDeploy(proyecto, { rama: proyecto.rama, origen: "manual" });
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
          origen: true,
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

      return lanzarDeploy(proyecto, {
        rama: deploy.rama,
        sha: deploy.sha,
        origen: "rollback",
      });
    }),

  indice: protectedProcedure.query(async () => {
    const proyectos = await prisma.proyecto.findMany({
      orderBy: [{ cliente: { nombre: "asc" } }, { nombre: "asc" }],
      select: {
        id: true,
        nombre: true,
        estado: true,
        dominio: true,
        cliente: { select: { nombre: true, slug: true } },
      },
    });
    return proyectos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      estado: p.estado,
      dominio: p.dominio,
      cliente: p.cliente.nombre,
      clienteSlug: p.cliente.slug,
    }));
  }),

  actividad: protectedProcedure.query(async () => {
    const [deploys, enAtencion] = await Promise.all([
      prisma.deploy.findMany({
        orderBy: { iniciadoEn: "desc" },
        take: 8,
        select: {
          id: true,
          proyectoId: true,
          rama: true,
          sha: true,
          resultado: true,
          origen: true,
          iniciadoEn: true,
          proyecto: {
            select: { nombre: true, cliente: { select: { nombre: true } } },
          },
        },
      }),
      prisma.proyecto.findMany({
        where: { estado: { in: ["error", "deploying"] } },
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          estado: true,
          cliente: { select: { nombre: true } },
          deploys: {
            orderBy: { iniciadoEn: "desc" },
            take: 1,
            select: {
              id: true,
              sha: true,
              rama: true,
              origen: true,
              output: true,
              iniciadoEn: true,
            },
          },
        },
      }),
    ]);

    return {
      recientes: deploys.map((d) => ({
        id: d.id,
        proyectoId: d.proyectoId,
        proyecto: d.proyecto.nombre,
        cliente: d.proyecto.cliente.nombre,
        rama: d.rama,
        sha: d.sha,
        resultado: d.resultado,
        origen: d.origen,
        hace: formatHace(d.iniciadoEn),
      })),
      atencion: await Promise.all(
        enAtencion.map(async (p) => {
          const ultimo = p.deploys[0];
          const ultimoBueno =
            p.estado === "error"
              ? await prisma.deploy.findFirst({
                  where: {
                    proyectoId: p.id,
                    resultado: "exito",
                    sha: { not: null },
                  },
                  orderBy: { iniciadoEn: "desc" },
                  select: { id: true, sha: true },
                })
              : null;
          // A running deploy has no stored output yet: read its live stream.
          const lineas =
            p.estado === "deploying"
              ? ultimasLineas(p.id, 3)
              : (ultimo?.output ?? "")
                  .split("\n")
                  .filter((l) => l.trim())
                  .slice(-3);
          return {
            id: p.id,
            nombre: p.nombre,
            cliente: p.cliente.nombre,
            estado: p.estado,
            deployId: ultimo?.id ?? null,
            sha: ultimo?.sha ?? null,
            rama: ultimo?.rama ?? null,
            origen: ultimo?.origen ?? null,
            hace: ultimo ? formatHace(ultimo.iniciadoEn) : null,
            lineas,
            rollback: ultimoBueno?.sha
              ? { deployId: ultimoBueno.id, sha: ultimoBueno.sha }
              : null,
          };
        }),
      ),
    };
  }),

  estadoSSL: protectedProcedure
    .input(z.object({ dominio: z.string() }))
    .query(async ({ input }) => {
      return leerEstadoSSL(input.dominio);
    }),

  listar: protectedProcedure.query(async () => {
    const [clientes, certificados] = await Promise.all([
      prisma.cliente.findMany({
        include: {
          proyectos: {
            orderBy: { nombre: "asc" },
            include: {
              deploys: {
                orderBy: { iniciadoEn: "desc" },
                take: 1,
                select: {
                  sha: true,
                  resultado: true,
                  origen: true,
                  iniciadoEn: true,
                },
              },
            },
          },
        },
        orderBy: { nombre: "asc" },
      }),
      leerCertificados(),
    ]);

    const result = await Promise.all(
      clientes.map(async (cliente) => ({
        id: cliente.id,
        slug: cliente.slug,
        nombre: cliente.nombre,
        proyectos: await Promise.all(
          cliente.proyectos.map(async (p) => {
            const cert = p.dominio ? certificados[p.dominio] : undefined;
            const ssl = p.dominio
              ? { activo: !!cert, caducaEn: cert?.caducaEn ?? null }
              : null;
            const ultimo = p.deploys?.[0];
            return {
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
              sslActivo: ssl?.activo ?? null,
              ssl,
              ultimoDeploy:
                p.ultimoDeployEn && p.ultimoDeployRama
                  ? {
                      hace: formatHace(p.ultimoDeployEn),
                      rama: p.ultimoDeployRama,
                      sha: ultimo?.sha ?? null,
                      resultado: ultimo?.resultado ?? null,
                      origen: ultimo?.origen ?? null,
                    }
                  : null,
            };
          }),
        ),
      })),
    );
    return result;
  }),

  obtenerCompose: protectedProcedure.input(idInput).query(async ({ input }) => {
    const proyecto = await findProyectoOrThrow(input.id);
    return { composeContent: proyecto.composeContent ?? null };
  }),

  guardarCompose: protectedProcedure
    .input(z.object({ id: z.string(), composeContent: z.string() }))
    .mutation(async ({ input }) => {
      await findProyectoOrThrow(input.id);
      return prisma.proyecto.update({
        where: { id: input.id },
        data: { composeContent: input.composeContent },
      });
    }),

  cargarComposeDesdeRepo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.id);

      if (!proyecto.repositorioUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El proyecto no tiene repositorio configurado",
        });
      }

      const { cliente, nombre, repositorioUrl, rama, credencialId } = proyecto;
      const repoDir = `${env.REPOS_DIR}/${cliente.slug}/${nombre}`;
      const panelDir = `${env.REPOS_DIR}/${cliente.slug}/.panel`;
      const keyFilePath = `${panelDir}/${nombre}.deploy_key`;

      await mkdir(panelDir, { recursive: true });

      let gitEnv: NodeJS.ProcessEnv = { ...process.env };
      let effectiveRepoUrl = repositorioUrl;

      if (credencialId) {
        const clavePrivada = await descifrarClavePrivada(credencialId);
        const normalizedKey =
          clavePrivada.replace(/\r\n/g, "\n").trimEnd() + "\n";
        await writeFile(keyFilePath, normalizedKey, { mode: 0o600 });
        gitEnv = {
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i ${keyFilePath} -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null`,
        };
        effectiveRepoUrl = repositorioUrl.replace(
          /^https:\/\/github\.com\/(.+?)(?:\.git)?$/,
          "git@github.com:$1.git",
        );
      }

      await prepararRepo(effectiveRepoUrl, repoDir, rama, gitEnv);

      let rawContent: string;
      try {
        rawContent = await readFile(`${repoDir}/docker-compose.yml`, "utf-8");
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No se encontró docker-compose.yml en el repositorio",
        });
      }

      // Replace build: . (or ./subdir) and context: . (or ./subdir) with the equivalent
      // path relative from panelDir to repoDir. docker compose resolves relative paths
      // from the compose file's directory (.panel/), so ../{nombre}[/subdir] always
      // points to the sibling repo directory (or a subdirectory within it, e.g. a
      // frontend built from ./frontend in the original repo-root compose).
      const relativePath = `../${nombre}`;
      const sustituirRelativo = (
        _match: string,
        prefijo: string,
        subruta: string | undefined,
        sufijo: string,
      ) => `${prefijo}${relativePath}${subruta ?? ""}${sufijo}`;
      const composeContent = rawContent
        .replace(/^(\s*build:\s*)\.(\/\S*)?(\s*)$/gm, sustituirRelativo)
        .replace(/^(\s*context:\s*)\.(\/\S*)?(\s*)$/gm, sustituirRelativo);

      return { composeContent };
    }),
});
