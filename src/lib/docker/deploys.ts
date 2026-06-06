import { prisma } from "@/lib/prisma";
import { deployProyecto } from "./deploy";

export async function ejecutarDeploy(params: {
  proyectoId: string;
  repoUrl: string;
  rama: string;
  clienteSlug: string;
  proyectoNombre: string;
  servicios: string[];
  variables?: Array<{ clave: string; valor: string }>;
}): Promise<{ resultado: "exito" | "error"; output: string }> {
  const { proyectoId, ...deployParams } = params;

  const registro = await prisma.deploy.create({
    data: { proyectoId, rama: deployParams.rama, resultado: "en_curso" },
  });

  try {
    const output = await deployProyecto(deployParams);
    await prisma.deploy
      .update({
        where: { id: registro.id },
        data: { resultado: "exito", output, finalizadoEn: new Date() },
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
