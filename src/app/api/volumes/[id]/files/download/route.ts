import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { zip } from "fflate";
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

function safeResolvePath(base: string, relative: string): string | null {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) return null;
  return resolved;
}

function zipAsync(entradas: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(entradas, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const volumen = await resolveVolumen(id);
  if (!volumen) return new Response("Not Found", { status: 404 });

  const filesParam = req.nextUrl.searchParams.get("files");
  if (!filesParam) return new Response("files param required", { status: 400 });

  const base = rutaHostVolumen(
    env.REPOS_DIR,
    volumen.proyecto.cliente.slug,
    volumen.proyecto.nombre,
    volumen.nombre,
  );

  const subpath = req.nextUrl.searchParams.get("path") ?? "";
  const dir = subpath ? safeResolvePath(base, subpath) : base;
  if (!dir) return new Response("Invalid path", { status: 400 });

  const nombres = filesParam
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const entradas: Record<string, Uint8Array> = {};
  for (const nombre of nombres) {
    const safeName = path.basename(nombre);
    const filePath = path.join(dir, safeName);
    if (!filePath.startsWith(base)) continue;
    try {
      const data = await readFile(filePath);
      entradas[safeName] = new Uint8Array(data);
    } catch {
      // skip missing files
    }
  }

  const zipData = await zipAsync(entradas);
  const timestamp = Date.now();
  const filename = `${volumen.nombre}-${timestamp}.zip`;

  return new Response(Buffer.from(zipData), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
