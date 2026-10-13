import {
  clearDeployEmitter,
  getOrCreateDeployEmitter,
} from "@/lib/deploy-stream";
import { prisma } from "@/lib/prisma";
import { deployProyecto } from "./deploy";
import { estadoContenedores } from "./proyectos";

type ResultadoDeploy = "exito" | "error" | "cancelado";

// NOTE: shared through globalThis because the deploy is started from one route
// bundle (tRPC, webhook) and cancelled from another (server action).
const globalForDeploys = globalThis as unknown as {
  deploysEnCurso?: Map<string, AbortController>;
};
const enCurso = (globalForDeploys.deploysEnCurso ??= new Map<
  string,
  AbortController
>());

export function cancelarDeploy(proyectoId: string, motivo: string): boolean {
  const controller = enCurso.get(proyectoId);
  if (!controller) return false;
  controller.abort(motivo);
  return true;
}

// A deploy whose process is gone (the panel restarted mid-deploy) stays en_curso
// forever and keeps the webhook skipping that project as deploy_en_curso.
export async function limpiarDeploysHuerfanos(
  motivo: string,
  proyectoId?: string,
): Promise<number> {
  const filtro = {
    notIn: [...enCurso.keys()],
    ...(proyectoId ? { equals: proyectoId } : {}),
  };
  await prisma.deploy.updateMany({
    where: { resultado: "en_curso", proyectoId: filtro },
    data: { resultado: "cancelado", output: motivo, finalizadoEn: new Date() },
  });

  const bloqueados = await prisma.proyecto.findMany({
    where: { estado: "deploying", id: filtro },
    include: { cliente: true },
  });
  for (const p of bloqueados) {
    const estado = await estadoContenedores(p.cliente.slug, p.nombre).catch(
      () => "error" as const,
    );
    await prisma.proyecto.update({ where: { id: p.id }, data: { estado } });
  }
  return bloqueados.length;
}

export async function ejecutarDeploy(params: {
  proyectoId: string;
  origen?: "manual" | "webhook" | "rollback";
  tipo: string;
  repoUrl?: string | null;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  composeContent?: string | null;
  variables?: Array<{ clave: string; valor: string }>;
  variablesBuildTime?: Array<{ clave: string; valor: string }>;
  credencial?: { clavePrivada: string };
  imagenUrl?: string | null;
  dockerfilePath?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
  puerto?: number | null;
  volumenes?: Array<{ rutaHost: string; rutaContenedor: string }>;
  timeoutMinutos?: number;
}): Promise<{
  resultado: ResultadoDeploy;
  output: string;
  porTimeout?: boolean;
}> {
  const {
    proyectoId,
    origen = "manual",
    timeoutMinutos = 0,
    ...deployParams
  } = params;

  // Create emitter synchronously (before first await) so SSE clients can subscribe
  // immediately after the router mutation returns.
  const emitter = getOrCreateDeployEmitter(proyectoId);

  const registro = await prisma.deploy.create({
    data: {
      proyectoId,
      rama: deployParams.rama,
      resultado: "en_curso",
      origen,
    },
  });

  const controller = new AbortController();
  enCurso.set(proyectoId, controller);
  let porTimeout = false;
  const temporizador =
    timeoutMinutos > 0
      ? setTimeout(() => {
          porTimeout = true;
          controller.abort(`Cancelado por timeout (${timeoutMinutos} min)`);
        }, timeoutMinutos * 60_000)
      : undefined;

  let resultado: ResultadoDeploy = "error";
  try {
    const { output, sha } = await deployProyecto({
      ...deployParams,
      signal: controller.signal,
      onLog: (line) => emitter.emit("line", line),
    });
    await prisma.deploy
      .update({
        where: { id: registro.id },
        data: { resultado: "exito", output, sha, finalizadoEn: new Date() },
      })
      .catch(() => {});
    resultado = "exito";
    return { resultado: "exito", output };
  } catch (err) {
    if (controller.signal.aborted) {
      const output = String(controller.signal.reason);
      emitter.emit("line", `⊘ ${output}`);
      await prisma.deploy
        .update({
          where: { id: registro.id },
          data: { resultado: "cancelado", output, finalizadoEn: new Date() },
        })
        .catch(() => {});
      resultado = "cancelado";
      return { resultado, output, porTimeout };
    }
    const e = err as { stdout?: string; stderr?: string };
    const output =
      [e.stdout ?? "", e.stderr ?? ""].filter(Boolean).join("\n") ||
      (err instanceof Error ? err.message : String(err));
    await prisma.deploy
      .update({
        where: { id: registro.id },
        data: { resultado: "error", output, finalizadoEn: new Date() },
      })
      .catch(() => {});
    return { resultado: "error", output };
  } finally {
    clearTimeout(temporizador);
    if (enCurso.get(proyectoId) === controller) enCurso.delete(proyectoId);
    emitter.emit("done", resultado);
    // Keep emitter alive briefly so late SSE subscribers receive the done event
    setTimeout(() => clearDeployEmitter(proyectoId, emitter), 30_000);
  }
}
