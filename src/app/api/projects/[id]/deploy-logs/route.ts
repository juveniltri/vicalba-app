import { type NextRequest } from "next/server";
import { getDeploySnapshot } from "@/lib/deploy-stream";
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
      const snapshot = getDeploySnapshot(id);
      if (!snapshot) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ tipo: "sin_deploy" })}\n\n`),
        );
        controller.close();
        return;
      }

      const { emitter, lines, done } = snapshot;

      for (const line of lines) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ line })}\n\n`),
        );
      }

      if (done) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ tipo: "done", resultado: done })}\n\n`,
          ),
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
