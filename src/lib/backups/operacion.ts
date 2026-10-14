import { prisma } from "@/lib/prisma";

export const LIMITE_MS = 60 * 60 * 1000;
export const MOTIVO_LIMITE = "Cancelado: superó 60 minutos";

// An aborted child process rejects with a generic AbortError; say why instead.
export function motivoDeFallo(err: unknown, signal: AbortSignal): string {
  if (
    err instanceof Error &&
    err.name === "AbortError" &&
    signal.reason === MOTIVO_LIMITE
  ) {
    return MOTIVO_LIMITE;
  }
  return err instanceof Error ? err.message : String(err);
}

export class OperacionEnCurso extends Error {
  constructor() {
    super("Ya hay una copia o restauración en curso");
    this.name = "OperacionEnCurso";
  }
}

// NOTE: globalThis because tRPC, server actions and the scheduler live in
// different route bundles but must see the same lock.
const global = globalThis as unknown as { operacionBackup?: AbortController };

export function tomarOperacion(): AbortController {
  if (global.operacionBackup) throw new OperacionEnCurso();
  global.operacionBackup = new AbortController();
  return global.operacionBackup;
}

export function soltarOperacion(): void {
  global.operacionBackup = undefined;
}

export function hayOperacionEnCurso(): boolean {
  return global.operacionBackup !== undefined;
}

// Called at startup: nothing can be running yet, so any en_curso row died
// with the previous process.
export async function limpiarBackupsHuerfanos(motivo: string): Promise<number> {
  const { count } = await prisma.backup.updateMany({
    where: { resultado: "en_curso" },
    data: { resultado: "error", error: motivo, finalizadoEn: new Date() },
  });
  return count;
}
