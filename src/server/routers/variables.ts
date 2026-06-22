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

// Los valores se escriben literalmente en ficheros .env — los saltos de línea
// romperían el formato y permitirían inyectar variables adicionales.
const valorSchema = z
  .string()
  .regex(/^[^\r\n]*$/, "El valor no puede contener saltos de línea");

const CLAVE_RE = /^[A-Z_][A-Z0-9_]*$/;

function parsearDotEnv(
  contenido: string,
): Array<{ clave: string; valor: string; valida: boolean }> {
  return contenido
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const sinExport = line.replace(/^export\s+/, "");
      const idx = sinExport.indexOf("=");
      if (idx === -1) return null;
      const clave = sinExport.slice(0, idx).trim();
      let valor = sinExport.slice(idx + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      return { clave, valor, valida: CLAVE_RE.test(clave) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

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
        valor: valorSchema,
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
    .input(z.object({ id: z.string(), valor: valorSchema }))
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

  importar: protectedProcedure
    .input(z.object({ proyectoId: z.string(), contenido: z.string() }))
    .mutation(async ({ input }) => {
      const { proyectoId, contenido } = input;
      const parsed = parsearDotEnv(contenido);
      const validas = parsed.filter((e) => e.valida);
      const invalidas = parsed.filter((e) => !e.valida).map((e) => e.clave);

      if (validas.length === 0)
        return { creadas: 0, actualizadas: 0, invalidas };

      const existentes = await prisma.variableEntorno.findMany({
        where: { proyectoId, clave: { in: validas.map((e) => e.clave) } },
        select: { clave: true },
      });
      const clavesExistentes = new Set(existentes.map((e) => e.clave));

      await Promise.all(
        validas.map(({ clave, valor }) => {
          const { valorCifrado, iv, authTag } = cifrar(valor);
          return prisma.variableEntorno.upsert({
            where: { proyectoId_clave: { proyectoId, clave } },
            create: { proyectoId, clave, valorCifrado, iv, authTag },
            update: { valorCifrado, iv, authTag },
            select: { id: true },
          });
        }),
      );

      return {
        creadas: validas.filter((e) => !clavesExistentes.has(e.clave)).length,
        actualizadas: validas.filter((e) => clavesExistentes.has(e.clave))
          .length,
        invalidas,
      };
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
