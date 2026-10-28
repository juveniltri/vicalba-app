import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { eliminarAuxiliar, nombreAuxiliar } from "./auxiliar";
import {
  etiquetasCopia,
  nombreStdin,
  procesoDumpMysql,
  procesoDumpPg,
  procesoListarBasesPg,
  procesoRolesPg,
  procesoTarDatos,
  type OrigenCopia,
} from "./comandos";
import type { Deteccion, Elemento, ElementoBd } from "./deteccion";
import { ejecutar, type Proceso } from "./procesos";
import { crearSnapshotStdin, type Restic } from "./restic";

const log = logger.child({ module: "backups" });

export const LIMITE_BD_MS = 60 * 60 * 1000;
export const LIMITE_DATOS_MS = 12 * 60 * 60 * 1000;

export type ResultadoElemento = {
  clave: string;
  ok: boolean;
  error?: string;
};

type Parte = { proceso: Proceso; nombre: string };
type Acumulado = { snapshotIds: string[]; bytes: number };

async function partesBd(e: ElementoBd, signal: AbortSignal): Promise<Parte[]> {
  if (e.motor === "mysql") {
    return [
      {
        proceso: procesoDumpMysql(e.contenedorId),
        nombre: nombreStdin({ tipo: "mysql", servicio: e.servicio }),
      },
    ];
  }
  const listado = procesoListarBasesPg(e.contenedorId);
  const salida = await ejecutar(listado.comando, listado.args, {
    env: listado.env,
    signal,
  });
  const bases = salida
    .split("\n")
    .map((b) => b.replace(/\r$/, ""))
    .filter((b) => b !== "");
  return [
    ...bases.map((base) => ({
      proceso: procesoDumpPg(e.contenedorId, base),
      nombre: nombreStdin({ tipo: "pg_base", servicio: e.servicio, base }),
    })),
    {
      proceso: procesoRolesPg(e.contenedorId),
      nombre: nombreStdin({ tipo: "pg_roles", servicio: e.servicio }),
    },
  ];
}

function motivo(
  err: unknown,
  ciclo: AbortSignal | undefined,
  limite: { signal: AbortSignal; mensaje: string },
): string {
  // A killed child only says "cancelado": the signals know why.
  if (err instanceof Error && err.name === "AbortError") {
    if (ciclo?.aborted && typeof ciclo.reason === "string") return ciclo.reason;
    if (limite.signal.aborted) return limite.mensaje;
  }
  return err instanceof Error ? err.message : String(err);
}

async function copiarElemento(
  e: Elemento,
  p: Parameters<typeof copiarProyecto>[0],
  acumulado: Acumulado,
): Promise<void> {
  if (e.tipo === "bd" && !e.enMarcha) {
    throw new Error(`El contenedor ${e.servicio} está parado`);
  }
  const ciclo = p.restic.signal;
  const [ms, texto] =
    e.tipo === "bd"
      ? [LIMITE_BD_MS, "60 minutos"]
      : [LIMITE_DATOS_MS, "12 horas"];
  // setTimeout rather than AbortSignal.timeout: the reason must name the element.
  const limite = new AbortController();
  const mensajeLimite = `Cancelado: ${e.clave} superó ${texto}`;
  const temporizador = setTimeout(() => limite.abort(), ms);
  const signal = ciclo
    ? AbortSignal.any([ciclo, limite.signal])
    : limite.signal;
  try {
    const partes =
      e.tipo === "bd"
        ? await partesBd(e, signal)
        : [
            {
              proceso: procesoTarDatos(
                nombreAuxiliar(p.backupId, e.clave),
                e.origen,
              ),
              nombre: nombreStdin({ tipo: "datos", clave: e.clave }),
            },
          ];
    const etiquetas = etiquetasCopia({
      proyectoId: p.proyecto.id,
      clave: e.clave,
      backupId: p.backupId,
      origen: p.origen,
    });
    for (const parte of partes) {
      const r = await crearSnapshotStdin(
        { ...p.restic, signal },
        { ...parte, etiquetas },
      );
      acumulado.snapshotIds.push(r.snapshotId);
      acumulado.bytes += r.bytesAnadidos;
    }
  } catch (err) {
    throw new Error(
      motivo(err, ciclo, { signal: limite.signal, mensaje: mensajeLimite }),
    );
  } finally {
    clearTimeout(temporizador);
    // Startup removes leftovers; a cleanup failure must not undo a good copy.
    if (e.tipo === "datos") {
      const auxiliar = nombreAuxiliar(p.backupId, e.clave);
      await eliminarAuxiliar(auxiliar).catch((err: unknown) =>
        log.warn(
          { err, auxiliar },
          "No se pudo eliminar el contenedor auxiliar",
        ),
      );
    }
  }
}

export async function copiarProyecto(p: {
  proyecto: { id: string; nombre: string; clienteSlug: string };
  backupId: string;
  origen: OrigenCopia;
  restic: Restic;
  deteccion: Deteccion;
  incluidos: (clave: string) => boolean;
  // A restore's pre-copy must save what it replaces, even if unticked.
  soloClaves?: string[];
}): Promise<ResultadoElemento[]> {
  const elegido = p.soloClaves
    ? (clave: string) => p.soloClaves!.includes(clave)
    : p.incluidos;
  const resultados: ResultadoElemento[] = [];
  for (const e of p.deteccion.elementos.filter((x) => elegido(x.clave))) {
    let fila: { id: string };
    try {
      fila = await prisma.elementoCopia.create({
        data: { backupId: p.backupId, clave: e.clave },
      });
    } catch (err) {
      // Prisma rejects with Error; without a row the element is not attempted.
      const error = (err as Error).message;
      log.error(
        { err, clave: e.clave, backupId: p.backupId },
        "No se pudo registrar el elemento de la copia",
      );
      resultados.push({ clave: e.clave, ok: false, error });
      continue;
    }
    const acumulado: Acumulado = { snapshotIds: [], bytes: 0 };
    let error: string | undefined;
    try {
      await copiarElemento(e, p, acumulado);
    } catch (err) {
      // copiarElemento always rejects with an Error carrying the reason.
      error = (err as Error).message;
    }
    // The row stays en_curso until startup's orphan cleanup closes it.
    await prisma.elementoCopia
      .update({
        where: { id: fila.id },
        data: {
          resultado: error === undefined ? "exito" : "error",
          ...(error === undefined ? {} : { error }),
          snapshotIds: acumulado.snapshotIds,
          bytesAnadidos: BigInt(acumulado.bytes),
        },
      })
      .catch((err: unknown) =>
        log.error(
          { err, clave: e.clave, backupId: p.backupId },
          "No se pudo cerrar el elemento de la copia",
        ),
      );
    resultados.push(
      error === undefined
        ? { clave: e.clave, ok: true }
        : { clave: e.clave, ok: false, error },
    );
  }
  return resultados;
}
