import { access, constants, stat, statfs } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BackupsNoConfigurados,
  conRestic,
  cargarConfigResuelta,
} from "@/lib/backups/configuracion";
import { iniciarCopiaProyecto, NadaQueCopiar } from "@/lib/backups/ciclo";
import { claveDeRuta } from "@/lib/backups/comandos";
import { iniciarCopia } from "@/lib/backups/copia";
import { detectarProyecto } from "@/lib/backups/deteccion";
import { generarClave, kitRecuperacion } from "@/lib/backups/kit";
import {
  OperacionEnCurso,
  cancelarOperacion,
  hayOperacionEnCurso,
} from "@/lib/backups/operacion";
import { proximaCopia } from "@/lib/backups/programacion";
import {
  urlRepositorio,
  type DestinoResuelto,
} from "@/lib/backups/repositorio";
import {
  abrirOInicializar,
  LIMITE_CONSULTA_MS,
  listarSnapshots,
  listarSnapshotsProyectos,
  mensajeSinRespuesta,
} from "@/lib/backups/restic";
import { iniciarRestauracion } from "@/lib/backups/restaurar";
import {
  estaRestaurando,
  ProyectoRestaurando,
} from "@/lib/backups/restaurando";
import {
  DeployEnCurso,
  iniciarRestauracionProyecto,
  RestauracionRechazada,
} from "@/lib/backups/restaurarProyecto";
import { cifrar, descifrar } from "@/lib/crypto";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { protectedProcedure, router } from "@/server/trpc";

const sinPuntos = (s: string) => !s.split("/").includes("..");
const claveInput = z.string().min(16).optional();

const destinoInput = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("s3"),
    endpoint: z.string().url().startsWith("https://"),
    bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    region: z.string().max(64).optional(),
    prefijo: z.string().max(200).refine(sinPuntos).optional(),
    accessKeyId: z.string().min(1).max(200),
    secretKey: z.string().max(400).optional(),
    clave: claveInput,
  }),
  z.object({
    tipo: z.literal("sftp"),
    // No leading "-": it would be read as an ssh option.
    host: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]*$/),
    puerto: z.number().int().min(1).max(65535),
    usuario: z.string().regex(/^[A-Za-z0-9._][A-Za-z0-9._-]*$/),
    ruta: z.string().startsWith("/").refine(sinPuntos),
    credencialId: z.string().min(1),
    clave: claveInput,
  }),
  z.object({ tipo: z.literal("local"), clave: claveInput }),
]);

export type DestinoInput = z.infer<typeof destinoInput>;

const ID = "default";

async function leerConfig() {
  return prisma.configuracionBackup.findUnique({ where: { id: ID } });
}

type ConfigGuardada = NonNullable<Awaited<ReturnType<typeof leerConfig>>>;

async function comprobarCarpetaLocal(): Promise<void> {
  const ruta = env.BACKUPS_LOCAL_DIR;
  try {
    if (!(await stat(ruta)).isDirectory()) throw new Error("no es carpeta");
    await access(ruta, constants.W_OK);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `La carpeta ${ruta} no existe o el Panel no puede escribir en ella. En la VPS: mkdir -p ${ruta} && chown 1001:1001 ${ruta}`,
    });
  }
}

async function espacioLibreLocal(): Promise<number | null> {
  try {
    const s = await statfs(env.BACKUPS_LOCAL_DIR);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

function repositorioGuardado(c: ConfigGuardada): string {
  if (c.tipoDestino === "local")
    return urlRepositorio({ tipo: "local", ruta: env.BACKUPS_LOCAL_DIR });
  return c.tipoDestino === "s3"
    ? urlRepositorio({
        tipo: "s3",
        endpoint: c.s3Endpoint ?? "",
        bucket: c.s3Bucket ?? "",
        prefijo: c.s3Prefijo,
        region: null,
        accessKeyId: "",
        secretKey: "",
      })
    : urlRepositorio({
        tipo: "sftp",
        host: c.sftpHost ?? "",
        puerto: c.sftpPuerto,
        usuario: c.sftpUsuario ?? "",
        ruta: c.sftpRuta ?? "",
        clavePrivada: "",
      });
}

function errorTrpc(err: unknown): never {
  const timeout = mensajeSinRespuesta(err);
  if (timeout) throw new TRPCError({ code: "TIMEOUT", message: timeout });
  if (
    err instanceof OperacionEnCurso ||
    err instanceof DeployEnCurso ||
    err instanceof ProyectoRestaurando
  )
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof NadaQueCopiar || err instanceof RestauracionRechazada)
    throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
  if (err instanceof BackupsNoConfigurados)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
  throw err;
}

const proyectoInput = z.object({ proyectoId: z.string().min(1) });

async function proyectoOrThrow(id: string) {
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      backupsHabilitados: true,
      cliente: { select: { slug: true } },
    },
  });
  if (!proyecto)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Proyecto no encontrado",
    });
  return proyecto;
}

export const backupsRouter = router({
  obtenerConfiguracion: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const ultimo = await prisma.backup.findFirst({
      where: { operacion: "copia", origen: "programado", proyectoId: null },
      orderBy: { iniciadoEn: "desc" },
      select: { iniciadoEn: true },
    });
    const hora = c?.hora ?? 3;
    return {
      habilitado: c?.habilitado ?? false,
      hora,
      tipoDestino: c?.tipoDestino ?? null,
      s3: {
        endpoint: c?.s3Endpoint ?? null,
        bucket: c?.s3Bucket ?? null,
        region: c?.s3Region ?? null,
        prefijo: c?.s3Prefijo ?? null,
        accessKeyId: c?.s3AccessKeyId ?? null,
        tieneSecretKey: Boolean(c?.s3SecretKeyCifrada),
      },
      sftp: {
        host: c?.sftpHost ?? null,
        puerto: c?.sftpPuerto ?? 22,
        usuario: c?.sftpUsuario ?? null,
        ruta: c?.sftpRuta ?? null,
        credencialId: c?.sftpCredencialId ?? null,
      },
      local: {
        ruta: env.BACKUPS_LOCAL_DIR,
        espacioLibreBytes:
          c?.tipoDestino === "local" ? await espacioLibreLocal() : null,
      },
      tieneClave: Boolean(c?.claveCifrada),
      claveConfirmada: Boolean(c?.claveConfirmadaEn),
      repositorioInicializado: Boolean(c?.repositorioInicializadoEn),
      proximaCopia: c?.habilitado
        ? proximaCopia(new Date(), hora, ultimo?.iniciadoEn ?? null)
        : null,
      enCurso: hayOperacionEnCurso(),
    };
  }),

  guardarDestino: protectedProcedure
    .input(destinoInput)
    .mutation(async ({ input }) => {
      const actual = await leerConfig();
      const claveGuardada =
        actual?.claveCifrada && actual.claveIv && actual.claveTag
          ? descifrar(actual.claveCifrada, actual.claveIv, actual.claveTag)
          : null;
      if (claveGuardada && input.clave) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La clave de cifrado no se puede cambiar",
        });
      }
      const clave = claveGuardada ?? input.clave ?? generarClave();

      let destino: DestinoResuelto;
      if (input.tipo === "s3") {
        const secretKey =
          input.secretKey ||
          (actual?.s3SecretKeyCifrada &&
          actual.s3SecretKeyIv &&
          actual.s3SecretKeyTag
            ? descifrar(
                actual.s3SecretKeyCifrada,
                actual.s3SecretKeyIv,
                actual.s3SecretKeyTag,
              )
            : "");
        if (!secretKey)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Falta la secret key",
          });
        destino = {
          tipo: "s3",
          endpoint: input.endpoint,
          bucket: input.bucket,
          region: input.region || null,
          prefijo: input.prefijo || null,
          accessKeyId: input.accessKeyId,
          secretKey,
        };
      } else if (input.tipo === "local") {
        await comprobarCarpetaLocal();
        destino = { tipo: "local", ruta: env.BACKUPS_LOCAL_DIR };
      } else {
        const cred = await prisma.credencial.findUnique({
          where: { id: input.credencialId },
        });
        if (!cred)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credencial SSH no encontrada",
          });
        destino = {
          tipo: "sftp",
          host: input.host,
          puerto: input.puerto,
          usuario: input.usuario,
          ruta: input.ruta,
          clavePrivada: descifrar(
            cred.clavePrivadaCifrada,
            cred.iv,
            cred.authTag,
          ),
        };
      }

      let repositorio: "existente" | "inicializado";
      try {
        repositorio = await conRestic(
          { destino, clave },
          AbortSignal.timeout(LIMITE_CONSULTA_MS),
          abrirOInicializar,
        );
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            mensajeSinRespuesta(err) ??
            (err instanceof Error ? err.message : String(err)),
        });
      }

      const mismoRepositorio =
        actual !== null &&
        repositorioGuardado(actual) === urlRepositorio(destino);
      const claveCif = cifrar(clave);
      const secret = destino.tipo === "s3" ? cifrar(destino.secretKey) : null;
      const datos = {
        tipoDestino: input.tipo,
        s3Endpoint: input.tipo === "s3" ? input.endpoint : null,
        s3Bucket: input.tipo === "s3" ? input.bucket : null,
        s3Region: input.tipo === "s3" ? input.region || null : null,
        s3Prefijo: input.tipo === "s3" ? input.prefijo || null : null,
        s3AccessKeyId: input.tipo === "s3" ? input.accessKeyId : null,
        s3SecretKeyCifrada: secret?.valorCifrado ?? null,
        s3SecretKeyIv: secret?.iv ?? null,
        s3SecretKeyTag: secret?.authTag ?? null,
        sftpHost: input.tipo === "sftp" ? input.host : null,
        sftpPuerto: input.tipo === "sftp" ? input.puerto : 22,
        sftpUsuario: input.tipo === "sftp" ? input.usuario : null,
        sftpRuta: input.tipo === "sftp" ? input.ruta : null,
        sftpCredencialId: input.tipo === "sftp" ? input.credencialId : null,
        claveCifrada: claveCif.valorCifrado,
        claveIv: claveCif.iv,
        claveTag: claveCif.authTag,
        repositorioInicializadoEn: new Date(),
        // A new repository makes the saved kit point to the old one: show it
        // again. A key typed in by the user comes from their kit: already saved.
        claveConfirmadaEn:
          (mismoRepositorio ? actual?.claveConfirmadaEn : null) ??
          (input.clave ? new Date() : null),
      };
      await prisma.configuracionBackup.upsert({
        where: { id: ID },
        create: { id: ID, ...datos },
        update: datos,
      });
      return { repositorio };
    }),

  obtenerKit: protectedProcedure.query(async () => {
    const c = await leerConfig();
    if (!c?.claveCifrada || !c.claveIv || !c.claveTag) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Aún no hay clave de cifrado",
      });
    }
    if (c.claveConfirmadaEn) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "El kit solo se muestra hasta confirmar que está guardado",
      });
    }
    const clave = descifrar(c.claveCifrada, c.claveIv, c.claveTag);
    return { kit: kitRecuperacion(repositorioGuardado(c), clave) };
  }),

  confirmarClave: protectedProcedure.mutation(async () => {
    await prisma.configuracionBackup.update({
      where: { id: ID },
      data: { claveConfirmadaEn: new Date() },
    });
  }),

  guardarProgramacion: protectedProcedure
    .input(
      z.object({
        habilitado: z.boolean(),
        hora: z.number().int().min(0).max(23),
      }),
    )
    .mutation(async ({ input }) => {
      const c = await leerConfig();
      if (
        input.habilitado &&
        (!c?.repositorioInicializadoEn || !c.claveConfirmadaEn)
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Configura el destino y confirma que has guardado el kit antes de activar los backups",
        });
      }
      await prisma.configuracionBackup.upsert({
        where: { id: ID },
        create: { id: ID, ...input },
        update: input,
      });
    }),

  lanzarCopia: protectedProcedure.mutation(async () => {
    try {
      return await iniciarCopia("manual");
    } catch (err) {
      errorTrpc(err);
    }
  }),

  historial: protectedProcedure.query(async () => {
    const filas = await prisma.backup.findMany({
      orderBy: { iniciadoEn: "desc" },
      take: 30,
    });
    return filas.map((f) => ({
      ...f,
      bytesAnadidos: f.bytesAnadidos === null ? null : Number(f.bytesAnadidos),
    }));
  }),

  copias: protectedProcedure.query(async () => {
    try {
      const config = await cargarConfigResuelta();
      return await conRestic(
        config,
        AbortSignal.timeout(LIMITE_CONSULTA_MS),
        listarSnapshots,
      );
    } catch (err) {
      errorTrpc(err);
    }
  }),

  restaurar: protectedProcedure
    .input(
      z.object({
        snapshotId: z.string().regex(/^[0-9a-f]{8,64}$/),
        confirmacion: z.literal("RESTAURAR"),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await iniciarRestauracion(input.snapshotId);
      } catch (err) {
        errorTrpc(err);
      }
    }),

  elementosProyecto: protectedProcedure
    .input(proyectoInput)
    .query(async ({ input }) => {
      const proyecto = await proyectoOrThrow(input.proyectoId);
      const [deteccion, filas, ultima] = await Promise.all([
        detectarProyecto(proyecto.cliente.slug, proyecto.nombre),
        prisma.elementoBackup.findMany({
          where: { proyectoId: proyecto.id },
        }),
        prisma.backup.findFirst({
          where: { operacion: "copia", proyectoId: proyecto.id },
          orderBy: { iniciadoEn: "desc" },
          select: { iniciadoEn: true, resultado: true },
        }),
      ]);
      const excluidos = new Set(
        filas.filter((f) => !f.incluido).map((f) => f.clave),
      );
      return {
        habilitado: proyecto.backupsHabilitados,
        valida: deteccion.valida,
        elementos: deteccion.elementos.map((e) => ({
          ...e,
          incluido: !excluidos.has(e.clave),
        })),
        noCopiados: deteccion.noCopiados,
        ultima,
        restaurando: estaRestaurando(proyecto.id),
        enCurso: hayOperacionEnCurso(),
      };
    }),

  marcarElemento: protectedProcedure
    .input(
      proyectoInput.extend({
        clave: z.string().min(1).max(500),
        incluido: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      await proyectoOrThrow(input.proyectoId);
      await prisma.elementoBackup.upsert({
        where: {
          proyectoId_clave: {
            proyectoId: input.proyectoId,
            clave: input.clave,
          },
        },
        create: {
          proyectoId: input.proyectoId,
          clave: input.clave,
          incluido: input.incluido,
        },
        update: { incluido: input.incluido },
      });
    }),

  habilitarProyecto: protectedProcedure
    .input(proyectoInput.extend({ habilitado: z.boolean() }))
    .mutation(async ({ input }) => {
      await proyectoOrThrow(input.proyectoId);
      await prisma.proyecto.update({
        where: { id: input.proyectoId },
        data: { backupsHabilitados: input.habilitado },
      });
    }),

  copiarProyecto: protectedProcedure
    .input(proyectoInput)
    .mutation(async ({ input }) => {
      try {
        return await iniciarCopiaProyecto(input.proyectoId);
      } catch (err) {
        errorTrpc(err);
      }
    }),

  copiasProyecto: protectedProcedure
    .input(proyectoInput)
    .query(async ({ input }) => {
      try {
        const config = await cargarConfigResuelta();
        const snapshots = await conRestic(
          config,
          AbortSignal.timeout(LIMITE_CONSULTA_MS),
          (r) => listarSnapshotsProyectos(r, input.proyectoId),
        );
        const grupos = new Map<string, typeof snapshots>();
        for (const s of snapshots)
          grupos.set(s.backupId, [...(grupos.get(s.backupId) ?? []), s]);
        return [...grupos.entries()]
          .map(([id, miembros]) => {
            const conBytes = miembros.filter((s) => s.bytes !== null);
            const claves = [
              ...new Set(miembros.map((s) => claveDeRuta(s.ruta))),
            ];
            return {
              id,
              fecha: new Date(
                Math.max(...miembros.map((s) => s.fecha.getTime())),
              ),
              origen: miembros[0].origen,
              bytes: conBytes.length
                ? conBytes.reduce((a, s) => a + Number(s.bytes), 0)
                : null,
              elementos: claves.map((clave) => ({
                clave,
                restaurable: !clave.startsWith("datos:.panel/"),
              })),
            };
          })
          .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
      } catch (err) {
        errorTrpc(err);
      }
    }),

  restaurarProyecto: protectedProcedure
    .input(
      proyectoInput.extend({
        copiaId: z.string().regex(/^[a-z0-9]{20,30}$/),
        claves: z.array(z.string().min(1).max(500)).min(1),
        confirmacion: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const proyecto = await proyectoOrThrow(input.proyectoId);
      if (input.confirmacion !== proyecto.nombre)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escribe el nombre del Proyecto para confirmar",
        });
      try {
        return await iniciarRestauracionProyecto({
          proyectoId: input.proyectoId,
          copiaId: input.copiaId,
          claves: input.claves,
        });
      } catch (err) {
        errorTrpc(err);
      }
    }),

  cancelar: protectedProcedure.mutation(({ ctx }) => {
    const quien =
      ctx.session.user?.name ?? ctx.session.user?.email ?? "un usuario";
    if (!cancelarOperacion(`Cancelado por ${quien}`))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No hay ninguna operación en curso",
      });
  }),

  enCurso: protectedProcedure.query(() => hayOperacionEnCurso()),

  resumen: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const [ultimaCorrecta, ultima] = await Promise.all([
      prisma.backup.findFirst({
        where: { operacion: "copia", resultado: "exito", proyectoId: null },
        orderBy: { iniciadoEn: "desc" },
        select: { iniciadoEn: true },
      }),
      prisma.backup.findFirst({
        where: { operacion: "copia", proyectoId: null },
        orderBy: { iniciadoEn: "desc" },
        select: { resultado: true },
      }),
    ]);
    return {
      habilitado: c?.habilitado ?? false,
      ultimaCorrecta: ultimaCorrecta?.iniciadoEn ?? null,
      ultimoResultado: ultima?.resultado ?? null,
    };
  }),
});
