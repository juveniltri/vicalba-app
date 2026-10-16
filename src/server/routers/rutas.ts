import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import {
  type Middlewares,
  type MiddlewaresEntrada,
  middlewaresEntradaSchema,
  middlewaresSchema,
} from "@/lib/schemas/middlewares";
import { leerCertificados } from "@/lib/ssl/acme";
import {
  contextoCloudflare,
  generarConfigProyecto,
  hostRedireccionWww,
  type RutaTraefik,
  sincronizarTraefikCliente,
} from "@/lib/traefik/config";
import { protectedProcedure, router } from "@/server/trpc";

export const dominioSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, {
    message: "El dominio debe ser un hostname válido (ej: app.ejemplo.com)",
  });

const rutaInput = z.object({
  dominio: dominioSchema,
  path: z
    .string()
    .max(200)
    .regex(/^(\/[A-Za-z0-9._~%-]*)*$/, {
      message: "El path debe empezar por / (ej: /api)",
    })
    .default("")
    .transform((path) => path.replace(/\/+$/, "")),
  // Docker Compose service names: alphanumeric start, then [a-zA-Z0-9._-]
  servicio: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
      message: "Nombre de servicio no válido",
    })
    .nullish(),
  puerto: z.number().int().min(1).max(65535).optional(),
  redireccionWww: z.enum(["ninguna", "a_raiz", "a_www"]).default("ninguna"),
  cloudflare: z.boolean().default(false),
  middlewares: middlewaresEntradaSchema.optional(),
});

// Traefik checks the password on every request, so a low cost keeps it cheap;
// "$2y$" is the Apache htpasswd spelling of the same algorithm.
const COSTE_BCRYPT = 5;
const hashear = (contrasena: string) =>
  "$2y$" + bcrypt.hashSync(contrasena, COSTE_BCRYPT).slice(4);

function conHashes(
  entrada: MiddlewaresEntrada,
  actual: Middlewares,
): Middlewares {
  const { basicAuth, ...resto } = entrada;
  if (!basicAuth) return resto;
  const hashes = new Map(
    actual.basicAuth?.usuarios.map((u) => [u.usuario, u.hash]),
  );
  return {
    ...resto,
    basicAuth: {
      usuarios: basicAuth.usuarios.map(({ usuario, contrasena }) => {
        const hash = contrasena ? hashear(contrasena) : hashes.get(usuario);
        if (!hash)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Falta la contraseña de «${usuario}»`,
          });
        return { usuario, hash };
      }),
    },
  };
}

// Hashes stay on the server: the Panel only shows who can log in.
function sinHashes<T extends { middlewares: unknown }>(ruta: T) {
  const { basicAuth, ...resto } = middlewaresSchema.parse(ruta.middlewares);
  return {
    ...ruta,
    middlewares: {
      ...resto,
      ...(basicAuth && {
        basicAuth: {
          usuarios: basicAuth.usuarios.map(({ usuario }) => ({ usuario })),
        },
      }),
    },
  };
}

const conWwwCoherente = <T extends z.ZodType<RutaCandidata>>(schema: T) =>
  schema.refine(
    (r) =>
      r.redireccionWww === "ninguna" ||
      r.dominio.startsWith("www.") === (r.redireccionWww === "a_www"),
    {
      message:
        "«Redirigir a www» necesita un dominio www.…; «redirigir a la raíz», uno sin www",
      path: ["redireccionWww"],
    },
  );

export const MAX_RUTAS_POR_PROYECTO = 20;

type RutaCandidata = Pick<RutaTraefik, "dominio" | "path" | "redireccionWww">;

// A route occupies its dominio+path; its www redirect occupies the whole
// secondary host, since that router matches every path.
export async function comprobarRutaDisponible(
  candidata: RutaCandidata,
  excluirId?: string,
): Promise<void> {
  const secundario = hostRedireccionWww(candidata);
  if (
    env.PANEL_DOMAIN &&
    [candidata.dominio, secundario].includes(env.PANEL_DOMAIN.toLowerCase())
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Ese dominio es el del Panel",
    });

  const existentes = (await prisma.rutaProyecto.findMany()).filter(
    (r) => r.id !== excluirId,
  );
  const ocupado = (host: string, path: string | null) =>
    existentes.some(
      (r) =>
        (r.dominio === host && (path === null || r.path === path)) ||
        hostRedireccionWww(r) === host,
    );
  if (
    ocupado(candidata.dominio, candidata.path) ||
    (secundario && ocupado(secundario, null))
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Ese dominio ya lo usa otra ruta",
    });
}

async function findProyectoOrThrow(id: string) {
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    include: { cliente: true },
  });
  if (!proyecto)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Proyecto no encontrado",
    });
  return proyecto;
}

async function findRutaOrThrow(id: string) {
  const ruta = await prisma.rutaProyecto.findUnique({
    where: { id },
    include: { proyecto: true },
  });
  if (!ruta)
    throw new TRPCError({ code: "NOT_FOUND", message: "Ruta no encontrada" });
  return ruta;
}

export const rutasRouter = router({
  listar: protectedProcedure
    .input(z.object({ proyectoId: z.string() }))
    .query(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.proyectoId);
      const [filas, certificados, cloudflare] = await Promise.all([
        prisma.rutaProyecto.findMany({
          where: { proyectoId: proyecto.id },
          orderBy: { creadoEn: "asc" },
        }),
        leerCertificados(),
        contextoCloudflare(),
      ]);
      const rutas = filas.map((r) => ({
        ...r,
        middlewares: middlewaresSchema.parse(r.middlewares),
      }));
      // Same YAML Traefik gets, but this one reaches the browser: no hashes.
      const yaml = generarConfigProyecto({
        proyectoId: proyecto.id,
        clienteSlug: proyecto.cliente.slug,
        proyectoNombre: proyecto.nombre,
        rutas: rutas.map((r) => ({
          ...r,
          middlewares: {
            ...r.middlewares,
            ...(r.middlewares.basicAuth && {
              basicAuth: {
                usuarios: r.middlewares.basicAuth.usuarios.map((u) => ({
                  usuario: u.usuario,
                  hash: "(oculta)",
                })),
              },
            }),
          },
        })),
        cloudflare,
      });
      return {
        rutas: rutas.map((r) => {
          const cert = certificados[r.dominio];
          return {
            ...sinHashes(r),
            ssl: { activo: !!cert, caducaEn: cert?.caducaEn ?? null },
          };
        }),
        yaml,
      };
    }),

  editar: protectedProcedure
    .input(conWwwCoherente(rutaInput.extend({ id: z.string() })))
    .mutation(async ({ input }) => {
      const actual = await findRutaOrThrow(input.id);
      await comprobarRutaDisponible(input, actual.id);
      const middlewares = input.middlewares
        ? conHashes(
            input.middlewares,
            middlewaresSchema.parse(actual.middlewares),
          )
        : undefined;
      const ruta = await prisma.rutaProyecto.update({
        where: { id: actual.id },
        data: {
          dominio: input.dominio,
          path: input.path,
          servicio:
            actual.proyecto.tipo === "compose"
              ? (input.servicio ?? null)
              : null,
          puerto: input.puerto ?? actual.puerto,
          redireccionWww: input.redireccionWww,
          cloudflare: input.cloudflare,
          ...(middlewares && { middlewares }),
        },
      });
      await sincronizarTraefikCliente(actual.proyecto.clienteId);
      return sinHashes(ruta);
    }),

  copiarMiddlewares: protectedProcedure
    .input(z.object({ desdeId: z.string(), haciaId: z.string() }))
    .mutation(async ({ input }) => {
      const desde = await findRutaOrThrow(input.desdeId);
      const hacia = await findRutaOrThrow(input.haciaId);
      await prisma.rutaProyecto.update({
        where: { id: hacia.id },
        data: { middlewares: middlewaresSchema.parse(desde.middlewares) },
      });
      await sincronizarTraefikCliente(hacia.proyecto.clienteId);
    }),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const ruta = await findRutaOrThrow(input.id);
      await prisma.rutaProyecto.delete({ where: { id: ruta.id } });
      await sincronizarTraefikCliente(ruta.proyecto.clienteId);
    }),

  crear: protectedProcedure
    .input(conWwwCoherente(rutaInput.extend({ proyectoId: z.string() })))
    .mutation(async ({ input }) => {
      const proyecto = await findProyectoOrThrow(input.proyectoId);
      const total = await prisma.rutaProyecto.count({
        where: { proyectoId: proyecto.id },
      });
      if (total >= MAX_RUTAS_POR_PROYECTO)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Un Proyecto admite como mucho ${MAX_RUTAS_POR_PROYECTO} rutas`,
        });
      await comprobarRutaDisponible(input);
      const middlewares = conHashes(input.middlewares ?? {}, {});
      const ruta = await prisma.rutaProyecto.create({
        data: {
          proyectoId: proyecto.id,
          dominio: input.dominio,
          path: input.path,
          servicio:
            proyecto.tipo === "compose" ? (input.servicio ?? null) : null,
          puerto: input.puerto ?? proyecto.puerto ?? 80,
          redireccionWww: input.redireccionWww,
          cloudflare: input.cloudflare,
          middlewares,
        },
      });
      await sincronizarTraefikCliente(proyecto.clienteId);
      return sinHashes(ruta);
    }),
});
