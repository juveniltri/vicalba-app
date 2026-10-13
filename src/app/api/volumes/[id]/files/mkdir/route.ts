import { mkdir } from "node:fs/promises";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { resolverRutaSegura, rutaHostVolumen } from "@/lib/volumenes";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  path: z.string(),
  nombre: z.string().min(1),
});

async function resolveVolumen(id: string) {
  return prisma.volumen.findUnique({
    where: { id },
    include: { proyecto: { include: { cliente: true } } },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const volumen = await resolveVolumen(id);
  if (!volumen) return new Response("Not Found", { status: 404 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return new Response("Invalid body", { status: 400 });
  }

  const base = rutaHostVolumen(
    env.REPOS_DIR,
    volumen.proyecto.cliente.slug,
    volumen.proyecto.nombre,
    volumen.nombre,
  );

  const relative = body.path ? `${body.path}/${body.nombre}` : body.nombre;
  const target = resolverRutaSegura(base, relative, { permitirRaiz: false });
  if (!target) return new Response("Invalid path", { status: 400 });

  try {
    await mkdir(target, { recursive: false });
    return new Response(null, { status: 201 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return new Response("Already exists", { status: 409 });
    }
    throw err;
  }
}
