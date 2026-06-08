import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { streamProyectoLogs } from "@/lib/docker/proyectos";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const proyecto = await prisma.proyecto.findUnique({
    where: { id },
    include: { cliente: true },
  });

  if (!proyecto) return new Response("Not Found", { status: 404 });

  const abortController = new AbortController();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { sinContenedores } = await streamProyectoLogs(
          proyecto.cliente.slug,
          proyecto.nombre,
          (servicio, line) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ servicio, line })}\n\n`),
            );
          },
          abortController.signal,
        );
        if (sinContenedores) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ tipo: "sin_contenedores" })}\n\n`,
            ),
          );
        }
      } catch {
        // stream ended or aborted
      }
      controller.close();
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
