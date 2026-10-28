import { z } from "zod";
import { ErrorProceso, ejecutar, type Proceso } from "./procesos";

export type Restic = {
  env: Record<string, string>;
  args: string[];
  signal?: AbortSignal;
};
export type Snapshot = { id: string; fecha: Date; bytes: number | null };

const ETIQUETA = "panel";
const HOST = "vicalba-panel";
// restic exit codes (0.17+): 10 = repository does not exist, 12 = wrong password.
const SIN_REPOSITORIO = 10;
const CLAVE_INCORRECTA = 12;

function restic(r: Restic, args: string[], cwd?: string): Promise<string> {
  return ejecutar("restic", [...r.args, ...args], {
    env: r.env,
    signal: r.signal,
    ...(cwd ? { cwd } : {}),
  });
}

const resumenSchema = z.object({
  message_type: z.literal("summary"),
  snapshot_id: z.string(),
  data_added: z.number(),
});

export function parsearResumenBackup(salida: string): {
  snapshotId: string;
  bytesAnadidos: number;
} {
  for (const linea of salida.trim().split("\n").reverse()) {
    const r = resumenSchema.safeParse(JSON.parse(linea));
    if (r.success) {
      return {
        snapshotId: r.data.snapshot_id,
        bytesAnadidos: r.data.data_added,
      };
    }
  }
  throw new Error("restic no devolvió el resumen de la copia");
}

const snapshotsSchema = z.array(
  z.object({
    id: z.string(),
    time: z.string(),
    summary: z.object({ total_bytes_processed: z.number() }).optional(),
  }),
);

export function parsearSnapshots(salida: string): Snapshot[] {
  return snapshotsSchema
    .parse(JSON.parse(salida))
    .map((s) => ({
      id: s.id,
      fecha: new Date(s.time),
      bytes: s.summary?.total_bytes_processed ?? null,
    }))
    .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export async function abrirOInicializar(
  r: Restic,
): Promise<"existente" | "inicializado"> {
  try {
    await restic(r, ["cat", "config"]);
    return "existente";
  } catch (err) {
    if (err instanceof ErrorProceso && err.codigo === SIN_REPOSITORIO) {
      await restic(r, ["init"]);
      return "inicializado";
    }
    if (err instanceof ErrorProceso && err.codigo === CLAVE_INCORRECTA) {
      throw new Error("La clave no abre el repositorio existente");
    }
    throw err;
  }
}

export async function crearSnapshot(
  r: Restic,
  carpeta: string,
): Promise<{ snapshotId: string; bytesAnadidos: number }> {
  const salida = await restic(
    r,
    ["backup", "--json", "--tag", ETIQUETA, "--host", HOST, "."],
    carpeta,
  );
  return parsearResumenBackup(salida);
}

export async function aplicarRetencion(r: Restic): Promise<void> {
  await restic(r, [
    "forget",
    "--json",
    "--tag",
    ETIQUETA,
    "--group-by",
    "host,tags",
    "--keep-daily",
    "7",
    "--keep-weekly",
    "4",
  ]);
}

export async function crearSnapshotStdin(
  r: Restic,
  p: { proceso: Proceso; nombre: string; etiquetas: string[] },
): Promise<{ snapshotId: string; bytesAnadidos: number }> {
  const salida = await restic(r, [
    "backup",
    "--json",
    "--quiet",
    "--host",
    HOST,
    ...p.etiquetas.flatMap((e) => ["--tag", e]),
    "--stdin-filename",
    p.nombre,
    "--stdin-from-command",
    "--",
    p.proceso.comando,
    ...p.proceso.args,
  ]);
  return parsearResumenBackup(salida);
}

export type SnapshotProyecto = {
  id: string;
  fecha: Date;
  bytes: number | null;
  ruta: string;
  proyectoId: string;
  hashElemento: string;
  backupId: string;
  origen: "programado" | "manual" | "antes_de_restaurar";
};

const origenSchema = z.enum(["programado", "manual", "antes_de_restaurar"]);

const snapshotsProyectoSchema = z.array(
  z.object({
    id: z.string(),
    time: z.string(),
    paths: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    summary: z.object({ total_bytes_processed: z.number() }).optional(),
  }),
);

function valorEtiqueta(tags: string[], prefijo: string): string | undefined {
  return tags.find((t) => t.startsWith(prefijo))?.slice(prefijo.length);
}

export function parsearSnapshotsProyectos(salida: string): SnapshotProyecto[] {
  const resultado: SnapshotProyecto[] = [];
  for (const s of snapshotsProyectoSchema.parse(JSON.parse(salida))) {
    const proyectoId = valorEtiqueta(s.tags, "p:");
    const hashElemento = valorEtiqueta(s.tags, "e:");
    const backupId = valorEtiqueta(s.tags, "c:");
    const origen = origenSchema.safeParse(valorEtiqueta(s.tags, "o:"));
    const ruta = s.paths[0];
    if (!proyectoId || !hashElemento || !backupId || !origen.success || !ruta) {
      continue;
    }
    resultado.push({
      id: s.id,
      fecha: new Date(s.time),
      bytes: s.summary?.total_bytes_processed ?? null,
      ruta,
      proyectoId,
      hashElemento,
      backupId,
      origen: origen.data,
    });
  }
  return resultado.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}

export async function listarSnapshotsProyectos(
  r: Restic,
  proyectoId?: string,
): Promise<SnapshotProyecto[]> {
  return parsearSnapshotsProyectos(
    await restic(r, [
      "snapshots",
      "--json",
      "--no-lock",
      "--tag",
      proyectoId ? `proyecto,p:${proyectoId}` : "proyecto",
    ]),
  );
}

export async function olvidar(
  r: Restic,
  p: {
    etiquetas: string[];
    politica: "7+4" | "30d" | "todo";
    ids?: string[];
  },
): Promise<void> {
  if (p.politica === "todo") {
    // Never by tag alone: the caller names exactly what goes.
    if (!p.ids?.length) return;
    await restic(r, ["forget", "--json", ...p.ids]);
    return;
  }
  await restic(r, [
    "forget",
    "--json",
    "--tag",
    p.etiquetas.join(","),
    "--group-by",
    "host,paths",
    ...(p.politica === "7+4"
      ? ["--keep-daily", "7", "--keep-weekly", "4"]
      : ["--keep-within", "30d"]),
  ]);
}

export async function podar(r: Restic): Promise<void> {
  await restic(r, ["prune"]);
}

export function volcarSnapshot(
  r: Restic,
  snapshotId: string,
  ruta: string,
): Proceso {
  return {
    comando: "restic",
    args: [...r.args, "dump", snapshotId, ruta],
    env: r.env,
  };
}

export async function listarSnapshots(r: Restic): Promise<Snapshot[]> {
  return parsearSnapshots(
    // Read-only listing: without a lock it does not fail while a copy prunes.
    await restic(r, ["snapshots", "--json", "--tag", ETIQUETA, "--no-lock"]),
  );
}

export async function restaurarSnapshot(
  r: Restic,
  snapshotId: string,
  destino: string,
): Promise<void> {
  await restic(r, ["restore", snapshotId, "--target", destino]);
}

// restic keeps retrying an unreachable or misconfigured backend for ~15 min and
// only reports when killed; its last retry line says why.
export function resumirErrorRestic(salida: string): string | null {
  const reintentos = [
    ...salida.matchAll(/returned error, retrying after [^:]+: (.*)$/gm),
  ];
  return reintentos.at(-1)?.[1] ?? null;
}

export const LIMITE_CONSULTA_MS = 30_000;

export function mensajeSinRespuesta(err: unknown): string | null {
  if (!(err instanceof Error) || err.name !== "AbortError") return null;
  const motivo = resumirErrorRestic(err.message);
  return `El destino no responde (${LIMITE_CONSULTA_MS / 1000} s)${motivo ? `: ${motivo}` : ""}`;
}

// Fails in seconds when the destination is down, instead of after restic's
// ~15 minutes of retries.
export async function comprobarDestino(r: Restic): Promise<void> {
  const limite = AbortSignal.timeout(LIMITE_CONSULTA_MS);
  const signal = r.signal ? AbortSignal.any([r.signal, limite]) : limite;
  try {
    await restic({ ...r, signal }, ["cat", "config"]);
  } catch (err) {
    const mensaje = r.signal?.aborted ? null : mensajeSinRespuesta(err);
    throw mensaje ? new Error(mensaje) : err;
  }
}
