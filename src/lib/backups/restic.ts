import { z } from "zod";
import { ErrorProceso, ejecutar } from "./procesos";

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
    "--prune",
  ]);
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
