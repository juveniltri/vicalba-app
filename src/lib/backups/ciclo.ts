import { logger } from "@/lib/logger";
import { notificarFalloBackup } from "@/lib/notificaciones";
import { prisma } from "@/lib/prisma";
import type { OrigenCopia } from "./comandos";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { copiarPanel, registrarFalloSinIniciar } from "./copia";
import { copiarProyecto, type ResultadoElemento } from "./copiaProyecto";
import { detectarProyecto, type Deteccion } from "./deteccion";
import { motivoDeFallo, soltarOperacion, tomarOperacion } from "./operacion";
import type { ConfigResuelta } from "./repositorio";
import {
  aplicarRetencion,
  comprobarDestino,
  podar,
  type Restic,
} from "./restic";
import { aplicarRetencionProyectos } from "./retencionProyectos";

const log = logger.child({ module: "backups" });

export class NadaQueCopiar extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NadaQueCopiar";
  }
}

const SIN_CONTENEDORES =
  "No hay nada que copiar: el Proyecto no tiene contenedores";
const SIN_INCLUIDOS =
  "No hay nada que copiar: ninguna BD ni carpeta de datos incluida";
const ELEMENTO_SIN_CERRAR = "No se pudo registrar el resultado del elemento";

const SELECCION_PROYECTO = {
  id: true,
  nombre: true,
  cliente: { select: { slug: true } },
} as const;

type ProyectoCopia = { id: string; nombre: string; clienteSlug: string };
type Preparado = {
  proyecto: ProyectoCopia;
  deteccion: Deteccion;
  incluidos: (clave: string) => boolean;
};

const nombreDe = (p: ProyectoCopia) => `${p.clienteSlug}/${p.nombre}`;

function proyectoDe(p: {
  id: string;
  nombre: string;
  cliente: { slug: string };
}): ProyectoCopia {
  return { id: p.id, nombre: p.nombre, clienteSlug: p.cliente.slug };
}

// Returns why there is nothing to copy, or what to copy.
async function preparar(proyecto: ProyectoCopia): Promise<Preparado | string> {
  const deteccion = await detectarProyecto(
    proyecto.clienteSlug,
    proyecto.nombre,
  );
  if (!deteccion.valida) return SIN_CONTENEDORES;
  const excluidos = await prisma.elementoBackup.findMany({
    where: { proyectoId: proyecto.id, incluido: false },
    select: { clave: true },
  });
  const fuera = new Set(excluidos.map((e) => e.clave));
  const incluidos = (clave: string) => !fuera.has(clave);
  if (!deteccion.elementos.some((e) => incluidos(e.clave))) {
    return SIN_INCLUIDOS;
  }
  return { proyecto, deteccion, incluidos };
}

function crearFila(proyecto: ProyectoCopia, origen: OrigenCopia) {
  return prisma.backup.create({
    data: {
      operacion: "copia",
      origen,
      proyectoId: proyecto.id,
      proyectoNombre: nombreDe(proyecto),
    },
  });
}

function copiar(
  prep: Preparado,
  backupId: string,
  origen: OrigenCopia,
  restic: Restic,
): Promise<ResultadoElemento[]> {
  return copiarProyecto({
    proyecto: prep.proyecto,
    backupId,
    origen,
    restic,
    deteccion: prep.deteccion,
    incluidos: prep.incluidos,
  });
}

// One warning per Proyecto, listing every failed element.
async function cerrarFila(
  backupId: string,
  proyecto: ProyectoCopia,
  origen: OrigenCopia,
  resultado: ResultadoElemento[] | string,
): Promise<void> {
  // copiarProyecto leaves an element en_curso when its closing update failed.
  const { count } = await prisma.elementoCopia.updateMany({
    where: { backupId, resultado: "en_curso" },
    data: { resultado: "error", error: ELEMENTO_SIN_CERRAR },
  });
  const fallidos =
    typeof resultado === "string"
      ? resultado
      : resultado
          .filter((r) => !r.ok)
          .map((r) => `${r.clave}: ${r.error}`)
          .join("\n");
  const error = fallidos || (count > 0 ? ELEMENTO_SIN_CERRAR : "");
  await prisma.backup.update({
    where: { id: backupId },
    data: error
      ? { resultado: "error", error, finalizadoEn: new Date() }
      : { resultado: "exito", finalizadoEn: new Date() },
  });
  if (error) {
    await notificarFalloBackup({
      operacion: "copia",
      origen,
      error,
      proyecto: nombreDe(proyecto),
    });
  }
}

async function copiarProyectoDelCiclo(
  proyecto: ProyectoCopia,
  restic: Restic,
  signal: AbortSignal,
): Promise<void> {
  try {
    const prep = await preparar(proyecto);
    // Never deployed, stopped with `down` or all unticked: not a failure.
    if (typeof prep === "string") return;
    const fila = await crearFila(proyecto, "programado");
    const resultado = await copiar(prep, fila.id, "programado", restic).catch(
      (err: unknown) => motivoDeFallo(err, signal),
    );
    await cerrarFila(fila.id, proyecto, "programado", resultado);
  } catch (err) {
    log.error(
      { err, proyectoId: proyecto.id },
      "No se pudo copiar el Proyecto",
    );
    await notificarFalloBackup({
      operacion: "copia",
      origen: "programado",
      error: motivoDeFallo(err, signal),
      proyecto: nombreDe(proyecto),
    });
  }
}

async function ejecutarCiclo(
  panelId: string,
  config: ConfigResuelta,
  signal: AbortSignal,
): Promise<void> {
  try {
    await conRestic(config, signal, comprobarDestino);
  } catch (err) {
    // A dead destination would fail every element: one error, one warning.
    const error = motivoDeFallo(err, signal);
    await prisma.backup.update({
      where: { id: panelId },
      data: { resultado: "error", error, finalizadoEn: new Date() },
    });
    await notificarFalloBackup({
      operacion: "copia",
      origen: "programado",
      error,
    });
    return;
  }
  await copiarPanel(panelId, config, signal, {
    origen: "programado",
    comprobar: false,
    retencion: false,
  });
  await conRestic(config, signal, async (r) => {
    const proyectos = await prisma.proyecto.findMany({
      where: { backupsHabilitados: true },
      select: SELECCION_PROYECTO,
    });
    for (const p of proyectos) {
      if (signal.aborted) break;
      await copiarProyectoDelCiclo(proyectoDe(p), r, signal);
    }
    if (signal.aborted) return;
    await aplicarRetencion(r);
    await aplicarRetencionProyectos(r);
    // Retention never prunes: one prune for the whole cycle.
    await podar(r);
  });
}

export async function iniciarCicloDiario(): Promise<{ id: string }> {
  let config: ConfigResuelta;
  try {
    config = await cargarConfigResuelta();
  } catch (err) {
    await registrarFalloSinIniciar(err);
    throw err;
  }
  const controller = tomarOperacion();
  const panel = await prisma.backup
    .create({ data: { operacion: "copia", origen: "programado" } })
    .catch((err: unknown) => {
      soltarOperacion();
      throw err;
    });
  void ejecutarCiclo(panel.id, config, controller.signal)
    .catch(async (err: unknown) => {
      log.error({ err }, "Ciclo diario de copias interrumpido");
      await notificarFalloBackup({
        operacion: "copia",
        origen: "programado",
        error: motivoDeFallo(err, controller.signal),
      });
    })
    .finally(() => soltarOperacion());
  return { id: panel.id };
}

export async function iniciarCopiaProyecto(
  proyectoId: string,
): Promise<{ id: string }> {
  const controller = tomarOperacion();
  const { signal } = controller;
  try {
    const config = await cargarConfigResuelta();
    const encontrado = await prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: SELECCION_PROYECTO,
    });
    if (!encontrado) throw new Error("El Proyecto no existe");
    const prep = await preparar(proyectoDe(encontrado));
    if (typeof prep === "string") throw new NadaQueCopiar(prep);
    const fila = await crearFila(prep.proyecto, "manual");
    void conRestic(config, signal, async (r) => {
      await comprobarDestino(r);
      return copiar(prep, fila.id, "manual", r);
    })
      .catch((err: unknown) => motivoDeFallo(err, signal))
      .then((resultado) =>
        cerrarFila(fila.id, prep.proyecto, "manual", resultado),
      )
      .catch((err: unknown) =>
        log.error({ err, proyectoId }, "No se pudo registrar la copia"),
      )
      .finally(() => soltarOperacion());
    return { id: fila.id };
  } catch (err) {
    soltarOperacion();
    throw err;
  }
}
