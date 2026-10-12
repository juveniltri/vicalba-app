import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { GITHUB_WEBHOOK_SECRET: "s3cret" } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { proyecto: { findMany: vi.fn() } },
}));
vi.mock("@/server/routers/proyectos", () => ({
  lanzarDeploy: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { lanzarDeploy } from "@/server/routers/proyectos";
import { POST } from "./route";

const proyectoCrm = {
  id: "p1",
  nombre: "crm",
  rama: "main",
  estado: "running",
  repositorioUrl: "https://github.com/microcapilar/crm",
  autoDeployHabilitado: true,
  cliente: { slug: "microcapilar" },
};

const pushPayload = {
  ref: "refs/heads/main",
  after: "e881352abcdef",
  repository: {
    clone_url: "https://github.com/microcapilar/crm.git",
    ssh_url: "git@github.com:microcapilar/crm.git",
  },
};

function peticion(
  body: string,
  {
    event = "push",
    contentType = "application/json",
    secret = "s3cret",
  }: { event?: string; contentType?: string; secret?: string } = {},
) {
  const firma =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return new NextRequest("https://panel.test/api/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "content-type": contentType,
      "x-github-event": event,
      "x-hub-signature-256": firma,
    },
  });
}

describe("POST /api/webhooks/github", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.proyecto.findMany).mockResolvedValue([
      proyectoCrm,
    ] as never);
    vi.mocked(lanzarDeploy).mockResolvedValue(proyectoCrm as never);
  });

  it("despliega aunque la URL guardada no lleve .git y responde 202", async () => {
    const res = await POST(peticion(JSON.stringify(pushPayload)));

    expect(res.status).toBe(202);
    expect(lanzarDeploy).toHaveBeenCalledWith(proyectoCrm, {
      rama: "main",
      sha: "e881352abcdef",
    });
  });

  it("acepta webhooks configurados como application/x-www-form-urlencoded", async () => {
    const body = new URLSearchParams({
      payload: JSON.stringify(pushPayload),
    }).toString();

    const res = await POST(
      peticion(body, { contentType: "application/x-www-form-urlencoded" }),
    );

    expect(res.status).toBe(202);
    expect(lanzarDeploy).toHaveBeenCalled();
  });

  it("responde al ping de GitHub sin desplegar", async () => {
    const res = await POST(peticion("{}", { event: "ping" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pong: true });
    expect(lanzarDeploy).not.toHaveBeenCalled();
  });

  it("rechaza con 401 una firma inválida", async () => {
    const res = await POST(
      peticion(JSON.stringify(pushPayload), { secret: "otro" }),
    );

    expect(res.status).toBe(401);
    expect(lanzarDeploy).not.toHaveBeenCalled();
  });

  it("no despliega proyectos de otro repositorio", async () => {
    vi.mocked(prisma.proyecto.findMany).mockResolvedValue([
      { ...proyectoCrm, repositorioUrl: "https://github.com/microcapilar/dp" },
    ] as never);

    const res = await POST(peticion(JSON.stringify(pushPayload)));

    expect(await res.json()).toMatchObject({ reason: "sin_proyecto" });
    expect(lanzarDeploy).not.toHaveBeenCalled();
  });

  it("no lanza un segundo deploy si el proyecto ya está desplegando", async () => {
    vi.mocked(prisma.proyecto.findMany).mockResolvedValue([
      { ...proyectoCrm, estado: "deploying" },
    ] as never);

    const res = await POST(peticion(JSON.stringify(pushPayload)));

    expect(await res.json()).toMatchObject({ reason: "deploy_en_curso" });
    expect(lanzarDeploy).not.toHaveBeenCalled();
  });

  it("ignora el push que borra la rama", async () => {
    const res = await POST(
      peticion(
        JSON.stringify({
          ...pushPayload,
          deleted: true,
          after: "0000000000000000000000000000000000000000",
        }),
      ),
    );

    expect(res.status).toBe(200);
    expect(lanzarDeploy).not.toHaveBeenCalled();
  });
});
