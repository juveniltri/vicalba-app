import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { hashClave } from "./comandos";
import { cargarConfigResuelta, conRestic } from "./configuracion";
import { detectarProyecto } from "./deteccion";
import { soltarOperacion, tomarOperacion } from "./operacion";
import {
  listarSnapshotsProyectos,
  olvidar,
  podar,
  type Restic,
  type SnapshotProyecto,
} from "./restic";

const log = logger.child({ module: "backups" });

const DIA_MS = 24 * 60 * 60 * 1000;
const GRACIA_PURGA_MS = 30 * DIA_MS;

export type PlanRetencion = {
  olvidos: { etiquetas: string[]; politica: "7+4" | "30d" }[];
  purgas: string[];
};

function ultimaFecha(snaps: SnapshotProyecto[]): number {
  return Math.max(...snaps.map((s) => s.fecha.getTime()));
}

export function planRetencion(
  snaps: SnapshotProyecto[],
  ctx: {
    proyectosExistentes: Set<string>;
    detectados: Map<string, Set<string> | null>;
    ahora: Date;
  },
): PlanRetencion {
  const limite = ctx.ahora.getTime() - GRACIA_PURGA_MS;
  const porProyecto = new Map<string, SnapshotProyecto[]>();
  for (const s of snaps) {
    porProyecto.set(s.proyectoId, [
      ...(porProyecto.get(s.proyectoId) ?? []),
      s,
    ]);
  }

  const plan: PlanRetencion = { olvidos: [], purgas: [] };
  for (const [proyectoId, delProyecto] of porProyecto) {
    if (!ctx.proyectosExistentes.has(proyectoId)) {
      if (ultimaFecha(delProyecto) < limite) {
        plan.purgas.push(...delProyecto.map((s) => s.id));
      }
      continue;
    }
    // null (or missing) means detection failed: never purge on that basis.
    const hashes = ctx.detectados.get(proyectoId) ?? null;
    const porElemento = new Map<string, SnapshotProyecto[]>();
    for (const s of delProyecto) {
      porElemento.set(s.hashElemento, [
        ...(porElemento.get(s.hashElemento) ?? []),
        s,
      ]);
    }
    for (const [hash, delElemento] of porElemento) {
      if (hashes && !hashes.has(hash) && ultimaFecha(delElemento) < limite) {
        plan.purgas.push(...delElemento.map((s) => s.id));
        continue;
      }
      const base = [`p:${proyectoId}`, `e:${hash}`];
      plan.olvidos.push({
        etiquetas: [...base, "o:programado"],
        politica: "7+4",
      });
      for (const origen of ["manual", "antes_de_restaurar"] as const) {
        if (delElemento.some((s) => s.origen === origen)) {
          plan.olvidos.push({
            etiquetas: [...base, `o:${origen}`],
            politica: "30d",
          });
        }
      }
    }
  }
  return plan;
}

// Never prunes: the daily cycle runs a single prune afterwards.
export async function aplicarRetencionProyectos(r: Restic): Promise<void> {
  const snaps = await listarSnapshotsProyectos(r);
  const proyectos = await prisma.proyecto.findMany({
    select: { id: true, nombre: true, cliente: { select: { slug: true } } },
  });
  const detectados = new Map<string, Set<string> | null>();
  for (const p of proyectos) {
    const d = await detectarProyecto(p.cliente.slug, p.nombre);
    detectados.set(
      p.id,
      d.valida ? new Set(d.elementos.map((e) => hashClave(e.clave))) : null,
    );
  }
  const plan = planRetencion(snaps, {
    proyectosExistentes: new Set(proyectos.map((p) => p.id)),
    detectados,
    ahora: new Date(),
  });
  for (const o of plan.olvidos) await olvidar(r, o);
  if (plan.purgas.length > 0) {
    await olvidar(r, { etiquetas: [], politica: "todo", ids: plan.purgas });
  }
}

// The lock is taken synchronously so a busy destination fails the caller at once.
export async function iniciarPurgaProyecto(proyectoId: string): Promise<void> {
  const controlador = tomarOperacion();
  void (async () => {
    try {
      const config = await cargarConfigResuelta();
      await conRestic(config, controlador.signal, async (r) => {
        const snaps = await listarSnapshotsProyectos(r, proyectoId);
        await olvidar(r, {
          etiquetas: [],
          politica: "todo",
          ids: snaps.map((s) => s.id),
        });
        await podar(r);
      });
    } catch (err) {
      log.error({ err, proyectoId }, "No se pudieron borrar las copias");
    } finally {
      soltarOperacion();
    }
  })();
}
