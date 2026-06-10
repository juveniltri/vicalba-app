import { prisma } from "@/lib/prisma";
import { deployProyecto } from "./deploy";

export async function ejecutarDeploy(params: {
  proyectoId: string;
  tipo: string;
  repoUrl?: string | null;
  rama: string;
  sha?: string;
  clienteSlug: string;
  proyectoNombre: string;
  variables?: Array<{ clave: string; valor: string }>;
  credencial?: { clavePrivada: string };
  imagenUrl?: string | null;
  dockerfilePath?: string | null;
  buildCommand?: string | null;
  startCommand?: string | null;
  puerto?: number | null;
}): Promise<{ resultado: "exito" | "error"; output: string }> {
  const { proyectoId, ...deployParams } = params;

  const registro = await prisma.deploy.create({
    data: { proyectoId, rama: deployParams.rama, resultado: "en_curso" },
  });

  try {
    const { output, sha } = await deployProyecto(deployParams);
    await prisma.deploy
      .update({
        where: { id: registro.id },
        data: { resultado: "exito", output, sha, finalizadoEn: new Date() },
      })
      .catch(() => {});
    return { resultado: "exito", output };
  } catch (err) {
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
  }
}
