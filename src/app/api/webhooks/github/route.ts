import { NextRequest, NextResponse } from "next/server";
import { verificarFirmaGitHub } from "@/lib/github/webhook";
import { deployProyecto } from "@/lib/docker/deploy";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";

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
    include: { cliente: true, servicios: true },
  });

  if (!proyecto) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.proyecto.update({
    where: { id: proyecto.id },
    data: { estado: "deploying" },
  });

  try {
    await deployProyecto({
      repoUrl: proyecto.repositorioUrl!,
      rama: proyecto.rama,
      clienteSlug: proyecto.cliente.slug,
      proyectoNombre: proyecto.nombre,
      servicios: proyecto.servicios.map((s) => s.nombre),
    });
    await prisma.proyecto.update({
      where: { id: proyecto.id },
      data: {
        estado: "running",
        ultimoDeployEn: new Date(),
        ultimoDeployRama: proyecto.rama,
      },
    });
  } catch {
    await prisma.proyecto.update({
      where: { id: proyecto.id },
      data: { estado: "error" },
    });
  }

  return NextResponse.json({ ok: true, deployed: proyecto.id });
}
