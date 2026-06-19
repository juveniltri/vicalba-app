import { readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/env";
import { rutaHostVolumen } from "@/lib/volumenes";
import { prisma } from "@/lib/prisma";

async function resolveVolumen(id: string) {
  return prisma.volumen.findUnique({
    where: { id },
    include: { proyecto: { include: { cliente: true } } },
  });
}

function hostDir(
  clienteSlug: string,
  proyectoNombre: string,
  volumenNombre: string,
): string {
  return rutaHostVolumen(
    env.REPOS_DIR,
    clienteSlug,
    proyectoNombre,
    volumenNombre,
  );
}

function safeResolvePath(base: string, relative: string): string | null {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

// GET — list files in volume directory
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const volumen = await resolveVolumen(id);
  if (!volumen) return new Response("Not Found", { status: 404 });

  const base = hostDir(
    volumen.proyecto.cliente.slug,
    volumen.proyecto.nombre,
    volumen.nombre,
  );

  const subpath = req.nextUrl.searchParams.get("path") ?? "";
  const target = subpath ? safeResolvePath(base, subpath) : base;
  if (!target) return new Response("Invalid path", { status: 400 });

  try {
    const entries = await readdir(target, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (e) => {
        const info = await stat(path.join(target, e.name)).catch(() => null);
        return {
          nombre: e.name,
          tipo: e.isDirectory() ? "dir" : "file",
          tamaño: info && !e.isDirectory() ? info.size : null,
          modificadoEn: info?.mtime ?? null,
        };
      }),
    );
    return Response.json(files);
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

// POST — upload file(s)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const volumen = await resolveVolumen(id);
  if (!volumen) return new Response("Not Found", { status: 404 });

  const base = hostDir(
    volumen.proyecto.cliente.slug,
    volumen.proyecto.nombre,
    volumen.nombre,
  );

  const subpath = req.nextUrl.searchParams.get("path") ?? "";
  const target = subpath ? safeResolvePath(base, subpath) : base;
  if (!target) return new Response("Invalid path", { status: 400 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response("Invalid form data", { status: 400 });
  }

  const subidos: string[] = [];
  for (const [, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const safeName = path.basename(value.name);
    if (!safeName || safeName === "." || safeName === "..") continue;
    const destPath = path.join(target, safeName);
    // Validate destination is still inside base dir
    if (!destPath.startsWith(base)) continue;
    const buffer = Buffer.from(await value.arrayBuffer());
    await writeFile(destPath, buffer);
    subidos.push(safeName);
  }

  return Response.json({ subidos });
}

// DELETE — remove file or directory
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const volumen = await resolveVolumen(id);
  if (!volumen) return new Response("Not Found", { status: 404 });

  const base = hostDir(
    volumen.proyecto.cliente.slug,
    volumen.proyecto.nombre,
    volumen.nombre,
  );

  const subpath = req.nextUrl.searchParams.get("path") ?? "";
  if (!subpath) return new Response("path is required", { status: 400 });

  const target = safeResolvePath(base, subpath);
  if (!target) return new Response("Invalid path", { status: 400 });

  try {
    await rm(target, { recursive: true, force: true });
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
