import { NextRequest, NextResponse } from "next/server";
import { verificarFirmaGitHub } from "@/lib/github/webhook";
import { prisma } from "@/lib/prisma";
import { createServerCaller } from "@/server/caller";
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
  });

  if (!proyecto) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const api = await createServerCaller();
  await api.proyectos.deploy({ id: proyecto.id });

  return NextResponse.json({ ok: true, deployed: proyecto.id });
}
