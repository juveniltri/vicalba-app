import { type NextRequest } from "next/server";
import { getDeployEmitter } from "@/lib/deploy-stream";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const emitter = getDeployEmitter(id);
      if (!emitter) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ tipo: "sin_deploy" })}\n\n`),
        );
        controller.close();
        return;
      }

      const onLine = (line: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ line })}\n\n`),
        );
      };

      const onDone = (resultado: "exito" | "error") => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ tipo: "done", resultado })}\n\n`,
          ),
        );
        controller.close();
        emitter.off("line", onLine);
        emitter.off("done", onDone);
      };

      emitter.on("line", onLine);
      emitter.on("done", onDone);
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
