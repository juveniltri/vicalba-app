import { NextRequest, NextResponse } from "next/server";
import { verificarFirmaGitHub } from "@/lib/github/webhook";
import { ejecutarDeploy } from "@/lib/docker/deploys";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { descifrar } from "@/lib/crypto";
import { enviarNotificacion } from "@/lib/notificaciones";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const event = req.headers.get("x-github-event") ?? "";

  if (!verificarFirmaGitHub(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let payload: { ref?: string; repository?: { clone_url?: string } };
  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const repoUrl = payload.repository?.clone_url;
  const rama = payload.ref?.replace("refs/heads/", "");

  if (!repoUrl || !rama) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const proyecto = await prisma.proyecto.findFirst({
    where: { repositorioUrl: repoUrl, rama, autoDeployHabilitado: true },
    include: { cliente: true, variables: true },
  });

  if (!proyecto) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.proyecto.update({
    where: { id: proyecto.id },
    data: { estado: "deploying" },
  });

  const variables = (
    proyecto.variables as Array<{
      clave: string;
      valorCifrado: string;
      iv: string;
      authTag: string;
    }>
  ).map((v) => ({
    clave: v.clave,
    valor: descifrar(v.valorCifrado, v.iv, v.authTag),
  }));

  const { resultado, output } = await ejecutarDeploy({
    proyectoId: proyecto.id,
    repoUrl: proyecto.repositorioUrl!,
    rama: proyecto.rama,
    clienteSlug: proyecto.cliente.slug,
    proyectoNombre: proyecto.nombre,
    variables,
  });

  await prisma.proyecto.update({
    where: { id: proyecto.id },
    data: {
      estado: resultado === "exito" ? "running" : "error",
      ...(resultado === "exito"
        ? { ultimoDeployEn: new Date(), ultimoDeployRama: proyecto.rama }
        : {}),
    },
  });

  enviarNotificacion({
    proyectoNombre: proyecto.nombre,
    clienteSlug: proyecto.cliente.slug,
    rama: proyecto.rama,
    sha: null,
    resultado,
    output,
  }).catch(() => {});

  return NextResponse.json({ ok: true, deployed: proyecto.id });
}
