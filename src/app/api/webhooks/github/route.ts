import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mismoRepositorio, verificarFirmaGitHub } from "@/lib/github/webhook";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { lanzarDeploy } from "@/server/routers/proyectos";

const pushPayloadSchema = z.object({
  ref: z.string(),
  after: z.string().optional(),
  deleted: z.boolean().optional(),
  repository: z.object({
    clone_url: z.string().optional(),
    ssh_url: z.string().optional(),
    html_url: z.string().optional(),
  }),
});

function extraerJson(body: string, contentType: string): unknown {
  // GitHub lets the webhook be configured as form-urlencoded: payload=<json>
  const json = contentType.includes("application/x-www-form-urlencoded")
    ? (new URLSearchParams(body).get("payload") ?? "")
    : body;
  return JSON.parse(json);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const event = req.headers.get("x-github-event") ?? "";

  if (!verificarFirmaGitHub(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  if (event !== "push") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let payload: z.infer<typeof pushPayloadSchema>;
  try {
    payload = pushPayloadSchema.parse(
      extraerJson(body, req.headers.get("content-type") ?? ""),
    );
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  if (!payload.ref.startsWith("refs/heads/") || payload.deleted) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  const rama = payload.ref.slice("refs/heads/".length);
  const urlsRecibidas = [
    payload.repository.clone_url,
    payload.repository.ssh_url,
    payload.repository.html_url,
  ].filter((u): u is string => !!u);

  const candidatos = await prisma.proyecto.findMany({
    where: { rama, autoDeployHabilitado: true, repositorioUrl: { not: null } },
    include: { cliente: true, credencial: true },
  });
  const proyectos = candidatos.filter((p) =>
    urlsRecibidas.some((u) => mismoRepositorio(p.repositorioUrl!, u)),
  );
  const desplegables = proyectos.filter((p) => p.estado !== "deploying");

  if (desplegables.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: proyectos.length ? "deploy_en_curso" : "sin_proyecto",
    });
  }

  // GitHub gives up after 10s, so the deploy runs in the background.
  await Promise.all(
    desplegables.map((p) =>
      lanzarDeploy(p, { rama, sha: payload.after, origen: "webhook" }),
    ),
  );

  return NextResponse.json(
    { ok: true, deployed: desplegables.map((p) => p.id) },
    { status: 202 },
  );
}
