import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  BackupsNoConfigurados,
  conRestic,
  cargarConfigResuelta,
} from "@/lib/backups/configuracion";
import { iniciarCopia } from "@/lib/backups/copia";
import { generarClave, kitRecuperacion } from "@/lib/backups/kit";
import { OperacionEnCurso, hayOperacionEnCurso } from "@/lib/backups/operacion";
import { proximaCopia } from "@/lib/backups/programacion";
import {
  urlRepositorio,
  type DestinoResuelto,
} from "@/lib/backups/repositorio";
import {
  abrirOInicializar,
  listarSnapshots,
  resumirErrorRestic,
} from "@/lib/backups/restic";
import { iniciarRestauracion } from "@/lib/backups/restaurar";
import { cifrar, descifrar } from "@/lib/crypto";
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
    host: z.string().regex(/^[A-Za-z0-9.-]+$/),
    puerto: z.number().int().min(1).max(65535),
    usuario: z.string().regex(/^[A-Za-z0-9._-]+$/),
    ruta: z.string().startsWith("/").refine(sinPuntos),
    credencialId: z.string().min(1),
    clave: claveInput,
  }),
]);

export type DestinoInput = z.infer<typeof destinoInput>;

const ID = "default";

async function leerConfig() {
  return prisma.configuracionBackup.findUnique({ where: { id: ID } });
}

// Interactive calls (form, page render) must not wait for restic's retries.
const LIMITE_CONSULTA_MS = 30_000;

function sinRespuesta(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== "AbortError") return null;
  const motivo = resumirErrorRestic(err.message);
  return `El destino no responde (${LIMITE_CONSULTA_MS / 1000} s)${motivo ? `: ${motivo}` : ""}`;
}

function errorTrpc(err: unknown): never {
  const timeout = sinRespuesta(err);
  if (timeout) throw new TRPCError({ code: "TIMEOUT", message: timeout });
  if (err instanceof OperacionEnCurso)
    throw new TRPCError({ code: "CONFLICT", message: err.message });
  if (err instanceof BackupsNoConfigurados)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
  throw err;
}

export const backupsRouter = router({
  obtenerConfiguracion: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const ultimo = await prisma.backup.findFirst({
      where: { operacion: "copia", origen: "programado" },
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
            sinRespuesta(err) ??
            (err instanceof Error ? err.message : String(err)),
        });
      }

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
        // A key typed in by the user comes from their kit: it is already saved.
        claveConfirmadaEn:
          actual?.claveConfirmadaEn ?? (input.clave ? new Date() : null),
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
    const repositorio =
      c.tipoDestino === "s3"
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
    return { kit: kitRecuperacion(repositorio, clave) };
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

  resumen: protectedProcedure.query(async () => {
    const c = await leerConfig();
    const [ultimaCorrecta, ultima] = await Promise.all([
      prisma.backup.findFirst({
        where: { operacion: "copia", resultado: "exito" },
        orderBy: { iniciadoEn: "desc" },
        select: { iniciadoEn: true },
      }),
      prisma.backup.findFirst({
        where: { operacion: "copia" },
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
